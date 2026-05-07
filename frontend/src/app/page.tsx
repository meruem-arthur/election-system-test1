'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');

    if (!token) {
      router.replace('/login');
      return;
    }

    if (userType === 'admin') {
      router.replace('/admin/dashboard');
    } else {
      router.replace('/student/vote');
    }
  }, []);

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  );
}
