const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, withTransaction } = require('../config/database');
const {
  authenticateAdmin, requireRole, requireElectionAccess,
  electionIdFromCandidate, electionIdFromPosition, electionIdFromStudent
} = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');
const auditService = require('../services/audit');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { sendCredentialsEmail } = require('../services/email');
const { sendCredentialsSMS } = require('../services/sms');
const { generateTempPassword } = require('../utils/password');
const credentialDispatch = require('../services/credentialDispatch');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const LOGIN_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// All admin routes require authentication
router.use(authenticateAdmin);

// ============================================================
// DASHBOARD STATISTICS
// ============================================================

router.get('/dashboard/:electionId', requireElectionAccess('electionId'), async (req, res) => {
  const { electionId } = req.params;
  try {
    const [electionRes, statsRes, turnoutByLevelRes, candidateVotesRes] = await Promise.all([
      pool.query('SELECT * FROM elections WHERE id = $1', [electionId]),
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE TRUE) as total_students,
          COUNT(*) FILTER (WHERE has_voted = true) as voted,
          COUNT(*) FILTER (WHERE has_voted = false) as not_voted
        FROM students WHERE election_id = $1
      `, [electionId]),
      pool.query(`
        SELECT level, COUNT(*) as total, COUNT(*) FILTER (WHERE has_voted = true) as voted
        FROM students WHERE election_id = $1 GROUP BY level ORDER BY level
      `, [electionId]),
      pool.query(`
        SELECT p.title as position, c.full_name as candidate, c.image_url,
               COUNT(b.id) as votes
        FROM positions p
        JOIN candidates c ON c.position_id = p.id
        LEFT JOIN ballots b ON b.candidate_id = c.id
        WHERE p.election_id = $1 AND c.is_approved = true
        GROUP BY p.id, p.title, c.id, c.full_name, c.image_url
        ORDER BY p.display_order, votes DESC
      `, [electionId])
    ]);

    const stats = statsRes.rows[0];
    const turnout = parseFloat(stats.total_students) > 0
      ? ((parseFloat(stats.voted) / parseFloat(stats.total_students)) * 100).toFixed(1)
      : '0.0';

    return res.json({
      election: electionRes.rows[0],
      stats: { ...stats, turnoutPercentage: turnout },
      turnoutByLevel: turnoutByLevelRes.rows,
      candidateVotes: candidateVotesRes.rows
    });
  } catch (err) {
    logger.error('Dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============================================================
// ELECTION MANAGEMENT
// ============================================================

router.get('/elections', async (req, res) => {
  const isSuperAdmin = req.admin.role === 'super_admin';
  const { rows } = await pool.query(
    `SELECT e.*, a.full_name as created_by_name
     FROM elections e
     LEFT JOIN admins a ON a.id = e.created_by
     ${isSuperAdmin ? '' : 'JOIN admin_election_assignments aea ON aea.election_id = e.id AND aea.admin_id = $1'}
     ORDER BY e.created_at DESC`,
    isSuperAdmin ? [] : [req.admin.id]
  );
  res.json(rows);
});

router.post('/elections', requireRole('super_admin'), async (req, res) => {
  const { title, description, department, academicYear, startTime, endTime, adminIds } = req.body;
  if (!title || !department || !academicYear) {
    return res.status(400).json({ error: 'Title, department, and academic year are required' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO elections (title, description, department, academic_year, start_time, end_time, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, description, department, academicYear, startTime, endTime, req.admin.id]
    );

    // Optionally assign one or more departmental admins to this election right away
    if (Array.isArray(adminIds) && adminIds.length > 0) {
      for (const adminId of adminIds) {
        await pool.query(
          `INSERT INTO admin_election_assignments (admin_id, election_id, assigned_by)
           VALUES ($1, $2, $3) ON CONFLICT (admin_id, election_id) DO NOTHING`,
          [adminId, rows[0].id, req.admin.id]
        );
      }
    }

    await auditService.log({
      action: 'election_created',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      electionId: rows[0].id,
      ip: req.ip
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('Create election error:', err);
    res.status(500).json({ error: 'Failed to create election' });
  }
});

router.patch('/elections/:id/status', requireRole('super_admin', 'election_admin'), requireElectionAccess('id'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['active', 'paused', 'ended', 'results_published'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  try {
    const updates = { status };
    if (status === 'results_published') updates.results_published_at = new Date();

    const setClause = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const { rows } = await pool.query(
      `UPDATE elections SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );

    await auditService.log({
      action: status === 'active' ? 'election_started' : 'election_stopped',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      electionId: id,
      metadata: { newStatus: status },
      ip: req.ip
    });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update election status' });
  }
});

// Delete election (any status) — clears all related data first
// Delete ALL elections (super_admin only)
router.delete('/elections', requireRole('super_admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) FROM elections');
    const count = parseInt(rows[0].count);

    await pool.query('DELETE FROM audit_logs WHERE election_id IS NOT NULL');
    await pool.query('DELETE FROM voter_status');
    await pool.query('DELETE FROM ballots');
    await pool.query('DELETE FROM otp_codes');
    await pool.query('DELETE FROM support_tickets');
    await pool.query('DELETE FROM csv_batches');
    await pool.query('DELETE FROM students');
    await pool.query('DELETE FROM candidates');
    await pool.query('DELETE FROM positions');
    await pool.query('DELETE FROM elections');

    res.json({ message: `${count} election(s) and all related data deleted successfully` });
  } catch (err) {
    logger.error('Delete all elections error:', err);
    res.status(500).json({ error: 'Failed to delete all elections: ' + err.message });
  }
});

// Delete single election
router.delete('/elections/:id', requireRole('super_admin'), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT id, title FROM elections WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Election not found' });

    // Delete in correct order to avoid foreign key violations
    await pool.query('DELETE FROM audit_logs WHERE election_id = $1', [id]);
    await pool.query('DELETE FROM voter_status WHERE election_id = $1', [id]);
    await pool.query('DELETE FROM ballots WHERE election_id = $1', [id]);
    await pool.query('DELETE FROM otp_codes WHERE student_id IN (SELECT id FROM students WHERE election_id = $1)', [id]);
    await pool.query('DELETE FROM support_tickets WHERE election_id = $1', [id]);
    await pool.query('DELETE FROM csv_batches WHERE election_id = $1', [id]);
    await pool.query('DELETE FROM students WHERE election_id = $1', [id]);
    await pool.query('DELETE FROM candidates WHERE election_id = $1', [id]);
    await pool.query('DELETE FROM positions WHERE election_id = $1', [id]);
    await pool.query('DELETE FROM elections WHERE id = $1', [id]);

    res.json({ message: 'Election and all related data deleted successfully' });
  } catch (err) {
    logger.error('Delete election error:', err);
    res.status(500).json({ error: 'Failed to delete election: ' + err.message });
  }
});


// ============================================================
// CSV STUDENT UPLOAD
// ============================================================

router.post('/elections/:electionId/students/upload', requireRole('super_admin', 'election_admin'), requireElectionAccess('electionId'), upload.single('csv'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });

  const { electionId } = req.params;
  const batchId = uuidv4();
  const errors = [];
  const valid = [];
  const seen = new Set();

  try {
    // Create batch record
    await pool.query(
      'INSERT INTO csv_batches (id, election_id, filename, uploaded_by) VALUES ($1, $2, $3, $4)',
      [batchId, electionId, req.file.originalname, req.admin.id]
    );

    const records = await new Promise((resolve, reject) => {
      parse(req.file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true
      }, (err, data) => err ? reject(err) : resolve(data));
    });

    // Map flexible column names
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;

      const fullName = row['Full Name'] || row['full_name'] || row['FullName'] || '';
      const surname = row['Surname'] || row['surname'] || row['Last Name'] || '';
      const indexNumber = row['Index Number'] || row['index_number'] || row['IndexNumber'] || '';
      const referenceNumber = row['Reference Number'] || row['reference_number'] || row['ReferenceNumber'] || '';
      const level = row['Level'] || row['level'] || '';
      const department = row['Department'] || row['department'] || '';
      const program = row['Program'] || row['programme'] || row['Program'] || '';
      const phone = row['Phone Number'] || row['phone'] || row['Phone'] || null;
      const email = row['School Email'] || row['Email'] || row['email'] || null;

      if (!fullName || !surname || !indexNumber || !referenceNumber || !level || !department || !program) {
        errors.push({ row: rowNum, error: 'Missing required fields', data: row });
        continue;
      }

      if (seen.has(referenceNumber)) {
        errors.push({ row: rowNum, error: `Duplicate reference number: ${referenceNumber}`, data: row });
        continue;
      }
      seen.add(referenceNumber);

      valid.push({ fullName, surname, indexNumber, referenceNumber, level, department, program, phone, email });
    }

    // Insert valid students
    let inserted = 0;
    let duplicates = 0;
    let credentialSendFailures = 0;

    for (const student of valid) {
      try {
        const tempPassword = generateTempPassword();
        const passwordHash = await bcrypt.hash(tempPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);

        const { rows: insertedRows } = await pool.query(
          `INSERT INTO students (election_id, full_name, surname, index_number, reference_number, level, department, program, phone_number, school_email, csv_batch_id, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (reference_number) DO NOTHING
           RETURNING id`,
          [electionId, student.fullName, student.surname, student.indexNumber, student.referenceNumber, student.level, student.department, student.program, student.phone, student.email, batchId, passwordHash]
        );

        if (insertedRows[0]) {
          inserted++;

          // Best-effort credential delivery — a delivery failure shouldn't
          // fail the import; the admin can resend via the regenerate route.
          try {
            if (student.email) {
              await sendCredentialsEmail(student.email, student.fullName, student.referenceNumber, tempPassword, `${LOGIN_URL}/login`, student.department);
            } else if (student.phone) {
              await sendCredentialsSMS(student.phone, student.fullName, student.referenceNumber, tempPassword, `${LOGIN_URL}/login`);
            } else {
              credentialSendFailures++;
              errors.push({ row: student.referenceNumber, error: 'No email or phone on file — credentials not sent. Use "Regenerate credentials" once contact info is added.' });
            }
          } catch (sendErr) {
            credentialSendFailures++;
            errors.push({ row: student.referenceNumber, error: `Student created but credential delivery failed: ${sendErr.message}` });
          }
        }
      } catch (err) {
        if (err.code === '23505') duplicates++;
        else errors.push({ error: err.message });
      }
    }

    // Update batch record
    await pool.query(
      `UPDATE csv_batches SET total_rows = $1, valid_rows = $2, duplicate_rows = $3, error_rows = $4, 
       error_log = $5, status = 'completed', completed_at = NOW() WHERE id = $6`,
      [records.length, inserted, duplicates, errors.length, JSON.stringify(errors), batchId]
    );

    await auditService.log({
      action: 'csv_uploaded',
      actorType: 'admin',
      actorId: req.admin.id,
      electionId,
      metadata: { filename: req.file.originalname, inserted, duplicates, errors: errors.length },
      ip: req.ip
    });

    res.json({
      batchId,
      total: records.length,
      inserted,
      duplicates,
      errors: errors.length,
      errorDetails: errors.slice(0, 50),
      message: `Upload complete: ${inserted} students added`
    });

  } catch (err) {
    logger.error('CSV upload error:', err);
    await pool.query('UPDATE csv_batches SET status = $1 WHERE id = $2', ['failed', batchId]);
    res.status(500).json({ error: 'Failed to process CSV file' });
  }
});

// ============================================================
// STUDENT LIST
// ============================================================

router.get('/elections/:electionId/students', requireElectionAccess('electionId'), async (req, res) => {
  const { electionId } = req.params;
  const { page = 1, limit = 50, search, hasVoted, level } = req.query;
  const offset = (page - 1) * limit;

  let conditions = ['s.election_id = $1'];
  let params = [electionId];
  let paramCount = 1;

  if (search) {
    paramCount++;
    conditions.push(`(s.full_name ILIKE $${paramCount} OR s.reference_number ILIKE $${paramCount} OR s.index_number ILIKE $${paramCount})`);
    params.push(`%${search}%`);
  }
  if (hasVoted !== undefined) {
    paramCount++;
    conditions.push(`s.has_voted = $${paramCount}`);
    params.push(hasVoted === 'true');
  }
  if (level) {
    paramCount++;
    conditions.push(`s.level = $${paramCount}`);
    params.push(level);
  }

  const where = conditions.join(' AND ');

  const [studentsRes, countRes] = await Promise.all([
    pool.query(`SELECT id, full_name, surname, index_number, reference_number, level, program, has_voted, voted_at, is_verified, account_locked, phone_number, school_email FROM students s WHERE ${where} ORDER BY s.full_name LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`, [...params, limit, offset]),
    pool.query(`SELECT COUNT(*) FROM students s WHERE ${where}`, params)
  ]);

  res.json({
    students: studentsRes.rows,
    total: parseInt(countRes.rows[0].count),
    page: parseInt(page),
    pages: Math.ceil(countRes.rows[0].count / limit)
  });
});

// ============================================================
// CANDIDATE MANAGEMENT
// ============================================================

router.get('/elections/:electionId/candidates', requireElectionAccess('electionId'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, p.title as position_title FROM candidates c
     JOIN positions p ON p.id = c.position_id
     WHERE c.election_id = $1 ORDER BY p.display_order, c.display_order`,
    [req.params.electionId]
  );
  res.json(rows);
});

router.post('/elections/:electionId/candidates', requireRole('super_admin', 'election_admin'), requireElectionAccess('electionId'), upload.single('image'), async (req, res) => {
  const { electionId } = req.params;
  const { fullName, indexNumber, program, level, bio, positionId, displayOrder } = req.body;

  if (!fullName || !positionId) return res.status(400).json({ error: 'Name and position required' });

  try {
    let imageUrl = null, imagePublicId = null;

    if (req.file) {
      const b64 = req.file.buffer.toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const cloudRes = await cloudinary.uploader.upload(dataURI, {
        folder: `elections/${electionId}/candidates`,
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
      });
      imageUrl = cloudRes.secure_url;
      imagePublicId = cloudRes.public_id;
    }

    const { rows } = await pool.query(
      `INSERT INTO candidates (election_id, position_id, full_name, index_number, program, level, bio, image_url, image_public_id, display_order, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [electionId, positionId, fullName, indexNumber, program, level, bio, imageUrl, imagePublicId, parseInt(displayOrder) || 0, req.admin.id]
    );

    await auditService.log({
      action: 'candidate_added',
      actorType: 'admin',
      actorId: req.admin.id,
      electionId,
      metadata: { candidateName: fullName },
      ip: req.ip
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error('Add candidate error:', err);
    res.status(500).json({ error: 'Failed to add candidate' });
  }
});

// Edit candidate
router.put('/candidates/:id', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromCandidate), upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { fullName, indexNumber, program, level, bio, positionId, displayOrder } = req.body;

  if (!fullName || !positionId) return res.status(400).json({ error: 'Name and position required' });

  try {
    let updateFields = {};
    updateFields.full_name = fullName;
    updateFields.position_id = positionId;
    updateFields.display_order = parseInt(displayOrder) || 0;
    if (indexNumber !== undefined) updateFields.index_number = indexNumber;
    if (program !== undefined) updateFields.program = program;
    if (level !== undefined) updateFields.level = level;
    if (bio !== undefined) updateFields.bio = bio;

    if (req.file) {
      // Delete old image from cloudinary if exists
      const { rows: existing } = await pool.query('SELECT image_public_id FROM candidates WHERE id = $1', [id]);
      if (existing[0]?.image_public_id) {
        await cloudinary.uploader.destroy(existing[0].image_public_id).catch(() => {});
      }
      const b64 = req.file.buffer.toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const cloudRes = await cloudinary.uploader.upload(dataURI, {
        folder: `elections/candidates`,
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }]
      });
      updateFields.image_url = cloudRes.secure_url;
      updateFields.image_public_id = cloudRes.public_id;
    }

    const keys = Object.keys(updateFields);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [id, ...Object.values(updateFields)];

    const { rows } = await pool.query(
      `UPDATE candidates SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );

    if (!rows[0]) return res.status(404).json({ error: 'Candidate not found' });

    await auditService.log({
      action: 'candidate_updated',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: { candidateId: id, candidateName: fullName },
      ip: req.ip
    });

    res.json(rows[0]);
  } catch (err) {
    logger.error('Update candidate error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to update candidate', detail: err.message });
  }
});

// Delete candidate
router.delete('/candidates/:id', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromCandidate), async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT id, full_name, image_public_id FROM candidates WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Candidate not found' });

    // Check if candidate has votes
    const { rows: voteRows } = await pool.query('SELECT COUNT(*) FROM ballots WHERE candidate_id = $1', [id]);
    if (parseInt(voteRows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete a candidate who has already received votes' });
    }

    // Delete image from cloudinary
    if (rows[0].image_public_id) {
      await cloudinary.uploader.destroy(rows[0].image_public_id).catch(() => {});
    }

    await pool.query('DELETE FROM candidates WHERE id = $1', [id]);

    await auditService.log({
      action: 'candidate_deleted',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: { candidateId: id, candidateName: rows[0].full_name },
      ip: req.ip
    });

    res.json({ message: 'Candidate deleted successfully' });
  } catch (err) {
    logger.error('Delete candidate error:', err);
    res.status(500).json({ error: 'Failed to delete candidate' });
  }
});

router.patch('/candidates/:id/approve', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromCandidate), async (req, res) => {
  const { rows } = await pool.query(
    'UPDATE candidates SET is_approved = true, approved_by = $1, approved_at = NOW() WHERE id = $2 RETURNING *',
    [req.admin.id, req.params.id]
  );

  await auditService.log({
    action: 'candidate_approved',
    actorType: 'admin',
    actorId: req.admin.id,
    metadata: { candidateId: req.params.id },
    ip: req.ip
  });

  res.json(rows[0]);
});

// ============================================================
// POSITIONS
// ============================================================

router.get('/elections/:electionId/positions', requireElectionAccess('electionId'), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM positions WHERE election_id = $1 ORDER BY display_order',
    [req.params.electionId]
  );
  res.json(rows);
});

router.post('/elections/:electionId/positions', requireRole('super_admin', 'election_admin'), requireElectionAccess('electionId'), async (req, res) => {
  const { title, description, displayOrder } = req.body;
  if (!title) return res.status(400).json({ error: 'Position title required' });

  const { rows } = await pool.query(
    'INSERT INTO positions (election_id, title, description, display_order) VALUES ($1, $2, $3, $4) RETURNING *',
    [req.params.electionId, title, description, displayOrder || 0]
  );
  res.status(201).json(rows[0]);
});

// Edit position
router.put('/positions/:id', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromPosition), async (req, res) => {
  const { id } = req.params;
  const { title, description, displayOrder } = req.body;
  if (!title) return res.status(400).json({ error: 'Position title required' });

  try {
    const { rows } = await pool.query(
      'UPDATE positions SET title = $1, description = $2, display_order = $3 WHERE id = $4 RETURNING *',
      [title, description, displayOrder || 0, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Position not found' });
    res.json(rows[0]);
  } catch (err) {
    logger.error('Update position error:', err);
    res.status(500).json({ error: 'Failed to update position' });
  }
});

// Delete position
router.delete('/positions/:id', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromPosition), async (req, res) => {
  const { id } = req.params;
  try {
    // Check if position has candidates
    const { rows: candRows } = await pool.query('SELECT COUNT(*) FROM candidates WHERE position_id = $1', [id]);
    if (parseInt(candRows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot delete a position that still has candidates. Remove candidates first.' });
    }

    const { rows } = await pool.query('DELETE FROM positions WHERE id = $1 RETURNING id, title', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Position not found' });

    res.json({ message: 'Position deleted successfully' });
  } catch (err) {
    logger.error('Delete position error:', err);
    res.status(500).json({ error: 'Failed to delete position' });
  }
});

// ============================================================
// ADMIN USER MANAGEMENT (Super Admin only)
// ============================================================

router.post('/admins', requireRole('super_admin'), async (req, res) => {
  const { email, fullName, role, password, electionIds } = req.body;
  if (!email || !fullName || !role || !password) return res.status(400).json({ error: 'All fields required' });

  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      'INSERT INTO admins (email, full_name, role, password_hash, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, full_name, role',
      [email, fullName, role, hash, req.admin.id]
    );
    const newAdmin = rows[0];

    // super_admin already has full access everywhere — assignment is meaningless
    // for that role, so only apply election assignments for non-super_admins.
    if (role !== 'super_admin' && Array.isArray(electionIds) && electionIds.length > 0) {
      for (const electionId of electionIds) {
        await pool.query(
          `INSERT INTO admin_election_assignments (admin_id, election_id, assigned_by)
           VALUES ($1, $2, $3) ON CONFLICT (admin_id, election_id) DO NOTHING`,
          [newAdmin.id, electionId, req.admin.id]
        );
      }
    }

    await auditService.log({ action: 'admin_created', actorType: 'admin', actorId: req.admin.id, metadata: { newAdminEmail: email }, ip: req.ip });
    res.status(201).json(newAdmin);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Admin with this email already exists' });
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

router.patch('/admins/:id/deactivate', requireRole('super_admin'), async (req, res) => {
  try {
    if (req.params.id === req.admin.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const { rows } = await pool.query('SELECT id, role, is_active FROM admins WHERE id = $1', [req.params.id]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: 'Admin not found' });

    if (target.role === 'super_admin') {
      const { rows: activeSuperAdmins } = await pool.query(
        "SELECT COUNT(*) FROM admins WHERE role = 'super_admin' AND is_active = true"
      );
      if (parseInt(activeSuperAdmins[0].count) <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate the only remaining active super admin' });
      }
    }

    await pool.query('UPDATE admins SET is_active = false WHERE id = $1', [req.params.id]);
    await auditService.log({
      action: 'admin_deactivated',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: { deactivatedAdminId: req.params.id },
      ip: req.ip
    });
    res.json({ message: 'Admin deactivated' });
  } catch (err) {
    logger.error('Deactivate admin error:', err);
    res.status(500).json({ error: 'Failed to deactivate admin' });
  }
});

router.patch('/admins/:id/reactivate', requireRole('super_admin'), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id FROM admins WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Admin not found' });

    await pool.query('UPDATE admins SET is_active = true WHERE id = $1', [req.params.id]);
    await auditService.log({
      action: 'admin_reactivated',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: { reactivatedAdminId: req.params.id },
      ip: req.ip
    });
    res.json({ message: 'Admin reactivated' });
  } catch (err) {
    logger.error('Reactivate admin error:', err);
    res.status(500).json({ error: 'Failed to reactivate admin' });
  }
});

router.get('/admins', requireRole('super_admin'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT a.id, a.email, a.full_name, a.role, a.is_active, a.last_login, a.created_at,
      COALESCE(
        json_agg(json_build_object('id', e.id, 'title', e.title)) FILTER (WHERE e.id IS NOT NULL),
        '[]'::json
      ) as assigned_elections
    FROM admins a
    LEFT JOIN admin_election_assignments aea ON aea.admin_id = a.id
    LEFT JOIN elections e ON e.id = aea.election_id
    GROUP BY a.id
    ORDER BY a.created_at
  `);
  res.json(rows);
});

// ============================================================
// ADMIN <-> ELECTION ASSIGNMENTS
// super_admin has full access everywhere by default and never needs a row
// here. election_admin / observer only see/manage elections they've been
// explicitly assigned to below.
// ============================================================

router.post('/admins/:adminId/elections/:electionId', requireRole('super_admin'), async (req, res) => {
  const { adminId, electionId } = req.params;
  try {
    const { rows: adminRows } = await pool.query('SELECT id, role FROM admins WHERE id = $1', [adminId]);
    if (!adminRows[0]) return res.status(404).json({ error: 'Admin not found' });
    if (adminRows[0].role === 'super_admin') {
      return res.status(400).json({ error: 'super_admin already has access to every election — no assignment needed' });
    }

    const { rows: electionRows } = await pool.query('SELECT id, title FROM elections WHERE id = $1', [electionId]);
    if (!electionRows[0]) return res.status(404).json({ error: 'Election not found' });

    await pool.query(
      `INSERT INTO admin_election_assignments (admin_id, election_id, assigned_by)
       VALUES ($1, $2, $3) ON CONFLICT (admin_id, election_id) DO NOTHING`,
      [adminId, electionId, req.admin.id]
    );

    await auditService.log({
      action: 'admin_election_assigned',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      electionId,
      metadata: { assignedAdminId: adminId },
      ip: req.ip
    });

    res.json({ message: `Assigned admin to election "${electionRows[0].title}"` });
  } catch (err) {
    logger.error('Assign admin to election error:', err);
    res.status(500).json({ error: 'Failed to assign admin to election' });
  }
});

router.delete('/admins/:adminId/elections/:electionId', requireRole('super_admin'), async (req, res) => {
  const { adminId, electionId } = req.params;
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM admin_election_assignments WHERE admin_id = $1 AND election_id = $2',
      [adminId, electionId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Assignment not found' });

    await auditService.log({
      action: 'admin_election_unassigned',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      electionId,
      metadata: { unassignedAdminId: adminId },
      ip: req.ip
    });

    res.json({ message: 'Admin unassigned from election' });
  } catch (err) {
    logger.error('Unassign admin from election error:', err);
    res.status(500).json({ error: 'Failed to unassign admin from election' });
  }
});

router.get('/admins/:adminId/elections', requireRole('super_admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.title, e.department, e.academic_year, e.status
     FROM admin_election_assignments aea
     JOIN elections e ON e.id = aea.election_id
     WHERE aea.admin_id = $1
     ORDER BY e.created_at DESC`,
    [req.params.adminId]
  );
  res.json(rows);
});

router.get('/elections/:electionId/admins', requireRole('super_admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.email, a.full_name, a.role
     FROM admin_election_assignments aea
     JOIN admins a ON a.id = aea.admin_id
     WHERE aea.election_id = $1
     ORDER BY a.full_name`,
    [req.params.electionId]
  );
  res.json(rows);
});

// ============================================================
// STUDENT ACCOUNT ACTIONS
// ============================================================

router.patch('/students/:id/unlock', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromStudent), async (req, res) => {
  await pool.query('UPDATE students SET account_locked = false, failed_login_attempts = 0 WHERE id = $1', [req.params.id]);
  res.json({ message: 'Account unlocked' });
});

// Regenerate a student's temporary password and resend it.
// Use this for: legacy students imported before random temp passwords existed
// (password_hash is null), or students locked out / who lost their credentials.
// Only allowed while the student hasn't completed their own password change yet.
router.patch('/students/:id/regenerate-credentials', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromStudent), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM students WHERE id = $1', [req.params.id]);
    const student = rows[0];
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (!student.is_first_login) {
      return res.status(400).json({
        error: 'Student has already set their own password. Regenerating would lock them out — use "Unlock" instead if they are locked, or contact them directly.'
      });
    }

    if (!student.school_email && !student.phone_number) {
      return res.status(400).json({ error: 'Student has no email or phone on file to send credentials to' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    await pool.query(
      'UPDATE students SET password_hash = $1, account_locked = false, failed_login_attempts = 0 WHERE id = $2',
      [passwordHash, student.id]
    );

    let sentVia = null;
    if (student.school_email) {
      await sendCredentialsEmail(student.school_email, student.full_name, student.reference_number, tempPassword, `${LOGIN_URL}/login`, student.department);
      sentVia = 'email';
    } else if (student.phone_number) {
      await sendCredentialsSMS(student.phone_number, student.full_name, student.reference_number, tempPassword, `${LOGIN_URL}/login`);
      sentVia = 'sms';
    }

    await auditService.log({
      action: 'credentials_regenerated',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: { studentId: student.id, studentName: student.full_name, sentVia },
      ip: req.ip
    });

    res.json({ message: `New credentials sent to ${student.full_name} via ${sentVia}` });
  } catch (err) {
    logger.error('Regenerate credentials error:', err);
    res.status(500).json({ error: 'Failed to regenerate credentials' });
  }
});

router.patch('/students/:id/reset-otp', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromStudent), async (req, res) => {
  await pool.query('UPDATE students SET is_verified = false WHERE id = $1', [req.params.id]);
  res.json({ message: 'OTP verification reset. Student must re-verify.' });
});

// Alias — /verify does the same as /approve
router.patch('/students/:id/verify', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromStudent), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE students SET is_verified = true WHERE id = $1 RETURNING id, full_name, reference_number',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Student not found' });
    await auditService.log({
      action: 'otp_verified',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: { action: 'manual_approval', studentName: rows[0].full_name },
      ip: req.ip
    });
    res.json({ message: `${rows[0].full_name} manually approved`, student: rows[0] });
  } catch (err) {
    logger.error('Verify student error:', err);
    res.status(500).json({ error: 'Failed to verify student' });
  }
});

// Manually approve a student (bypass OTP) — admin verified identity in person
router.patch('/students/:id/approve', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromStudent), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE students SET is_verified = true WHERE id = $1 RETURNING id, full_name, reference_number',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Student not found' });

    await auditService.log({
      action: 'otp_verified',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: {
        action: 'manual_approval',
        studentId: req.params.id,
        studentName: rows[0].full_name,
        approvedBy: req.admin.email
      },
      ip: req.ip
    });

    res.json({ message: `${rows[0].full_name} manually approved`, student: rows[0] });
  } catch (err) {
    logger.error('Manual approve error:', err);
    res.status(500).json({ error: 'Failed to approve student' });
  }
});

// Update student contact details (email / phone) — then optionally resend OTP
router.patch('/students/:id/contact', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromStudent), async (req, res) => {
  const { phoneNumber, schoolEmail } = req.body;
  if (!phoneNumber && !schoolEmail) {
    return res.status(400).json({ error: 'Provide at least a phone number or email' });
  }

  try {
    // Build dynamic update
    const updates = [];
    const values = [];
    let idx = 1;

    // Only update a field when a non-empty value was actually provided —
    // an empty string means "leave this field as-is in the database"
    if (schoolEmail && schoolEmail.trim() !== '') {
      updates.push(`school_email = $${idx++}`);
      values.push(schoolEmail.trim());
    }
    if (phoneNumber && phoneNumber.trim() !== '') {
      updates.push(`phone_number = $${idx++}`);
      values.push(phoneNumber.trim());
    }
    // Reset verification so they go through OTP with new contact
    updates.push(`is_verified = false`);
    values.push(req.params.id);

    const { rows } = await pool.query(
      `UPDATE students SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Student not found' });

    await auditService.log({
      action: 'otp_verified',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: {
        action: 'contact_updated',
        studentId: req.params.id,
        studentName: rows[0].full_name,
        updatedBy: req.admin.email
      },
      ip: req.ip
    });

    // Optionally resend OTP with new contact
    const { resendOTP } = req.body;
    if (resendOTP) {
      try {
        const otpService = require('../services/otp');
        await otpService.sendOTP(rows[0]);
        return res.json({ message: 'Contact updated and OTP resent', student: rows[0], otpSent: true });
      } catch (otpErr) {
        logger.error('OTP resend after contact update failed:', otpErr);
        return res.json({ message: 'Contact updated but OTP failed to send. Use console code.', student: rows[0], otpSent: false });
      }
    }

    res.json({ message: 'Contact details updated. Student must verify again.', student: rows[0] });
  } catch (err) {
    logger.error('Update contact error:', err);
    res.status(500).json({ error: 'Failed to update contact details' });
  }
});

// Delete a single student
router.delete('/students/:id', requireRole('super_admin', 'election_admin'), requireElectionAccess(electionIdFromStudent), async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, full_name FROM students WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Student not found' });

    // Clear related records first
    await pool.query('DELETE FROM otp_codes WHERE student_id = $1', [req.params.id]);
    await pool.query('DELETE FROM voter_status WHERE student_id = $1', [req.params.id]);
    await pool.query('DELETE FROM support_tickets WHERE student_id = $1', [req.params.id]);
    await pool.query('DELETE FROM students WHERE id = $1', [req.params.id]);

    await auditService.log({
      action: 'csv_uploaded',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      metadata: { action: 'student_deleted', studentName: rows[0].full_name },
      ip: req.ip
    });

    res.json({ message: 'Student removed successfully' });
  } catch (err) {
    logger.error('Delete student error:', err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// Delete ALL students in an election
router.delete('/elections/:electionId/students', requireRole('super_admin', 'election_admin'), requireElectionAccess('electionId'), async (req, res) => {
  const { electionId } = req.params;
  try {
    // Get all student IDs for this election
    const { rows: studentRows } = await pool.query('SELECT id FROM students WHERE election_id = $1', [electionId]);
    const studentIds = studentRows.map(s => s.id);

    if (studentIds.length > 0) {
      // Clear all related records
      await pool.query('DELETE FROM otp_codes WHERE student_id = ANY($1)', [studentIds]);
      await pool.query('DELETE FROM voter_status WHERE student_id = ANY($1)', [studentIds]);
      await pool.query('DELETE FROM support_tickets WHERE student_id = ANY($1)', [studentIds]);
    }

    await pool.query('DELETE FROM students WHERE election_id = $1', [electionId]);

    await auditService.log({
      action: 'csv_uploaded',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      electionId,
      metadata: { action: 'all_students_deleted', count: studentIds.length },
      ip: req.ip
    });

    res.json({ message: `${studentIds.length} students removed successfully` });
  } catch (err) {
    logger.error('Delete all students error:', err);
    res.status(500).json({ error: 'Failed to delete students' });
  }
});

// ============================================================
// BULK CREDENTIAL DISPATCH
// For migrating/regenerating credentials for many students at once
// (e.g. students whose password_hash is currently NULL, or a full
// re-issue before an election). Complements, not replaces, the
// single-student CSV-upload-time send and /regenerate-credentials
// route above.
// ============================================================

// Queue credential generation + dual-channel send for every student in
// the election who hasn't set their own password yet (is_first_login =
// true). Safe to call repeatedly — students already queued or already
// past first login are automatically skipped, never re-touched.
router.post('/elections/:electionId/students/regenerate-credentials-bulk', requireRole('super_admin', 'election_admin'), requireElectionAccess('electionId'), async (req, res) => {
  const { electionId } = req.params;
  const { studentIds } = req.body; // optional — omit to target the whole election

  try {
    const result = await credentialDispatch.enqueueForElection({
      electionId,
      adminId: req.admin.id,
      studentIds: Array.isArray(studentIds) ? studentIds : null
    });

    await auditService.log({
      action: 'credentials_dispatched',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      electionId,
      metadata: { action: 'bulk_queue', ...result },
      ip: req.ip
    });

    res.json({
      message: `Queued ${result.queued} student(s) for credential dispatch`,
      ...result
    });
  } catch (err) {
    logger.error('Bulk regenerate credentials error:', err);
    res.status(500).json({ error: 'Failed to queue credential dispatch' });
  }
});

// Dashboard: per-student delivery status for an election.
router.get('/elections/:electionId/credential-dispatch', requireElectionAccess('electionId'), async (req, res) => {
  const { electionId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT cd.id, cd.student_id, s.full_name, s.reference_number,
              s.school_email, s.phone_number,
              cd.email_status, cd.email_error, cd.sms_status, cd.sms_error,
              cd.sms_delivery_status, cd.sms_delivery_error, cd.sms_delivered_at,
              cd.blocked_no_contact, cd.attempts, cd.created_at, cd.updated_at
       FROM credential_dispatch cd
       JOIN students s ON s.id = cd.student_id
       WHERE cd.election_id = $1
       ORDER BY cd.created_at DESC`,
      [electionId]
    );

    const summary = rows.reduce((acc, r) => {
      const resolved = r.email_status !== 'pending' && r.sms_status !== 'pending';
      const anySent = r.email_status === 'sent' || r.sms_status === 'sent';
      const anyFailed = r.email_status === 'failed' || r.sms_status === 'failed';
      const smsUndelivered = r.sms_delivery_status === 'undelivered' || r.sms_delivery_status === 'failed';
      if (r.blocked_no_contact) acc.blockedNoContact++;
      else if (!resolved) acc.pending++;
      else if (anyFailed && !anySent) acc.failed++;
      else acc.delivered++;
      if (smsUndelivered) acc.smsUndeliveredDespiteAccepted++;
      return acc;
    }, { pending: 0, delivered: 0, failed: 0, blockedNoContact: 0, smsUndeliveredDespiteAccepted: 0 });

    res.json({ summary, students: rows });
  } catch (err) {
    logger.error('Credential dispatch dashboard error:', err);
    res.status(500).json({ error: 'Failed to load credential dispatch status' });
  }
});

// Requeue only the students/channels that failed. Does NOT touch students
// still legitimately pending (already being worked by the background
// worker) or students blocked on missing contact info (fix their contact
// info via PATCH /students/:id/contact first, which naturally picks them
// up on the next bulk call).
router.post('/elections/:electionId/credential-dispatch/resend-failed', requireRole('super_admin', 'election_admin'), requireElectionAccess('electionId'), async (req, res) => {
  const { electionId } = req.params;
  const { studentIds } = req.body; // optional — omit to retry everyone failed

  try {
    const result = await credentialDispatch.resendFailed({
      electionId,
      studentIds: Array.isArray(studentIds) ? studentIds : null
    });

    await auditService.log({
      action: 'credentials_dispatched',
      actorType: 'admin',
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      electionId,
      metadata: { action: 'resend_failed', ...result },
      ip: req.ip
    });

    res.json({ message: `Requeued ${result.requeued} failed delivery attempt(s)`, ...result });
  } catch (err) {
    logger.error('Resend failed credentials error:', err);
    res.status(500).json({ error: 'Failed to requeue failed deliveries' });
  }
});

module.exports = router;
