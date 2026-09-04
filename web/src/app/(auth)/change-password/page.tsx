import type { Metadata } from 'next';
import { requireRawSession } from '@/server/context';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = { title: 'Set a new password' };

export default async function ChangePasswordPage() {
  const session = await requireRawSession();
  return <ChangePasswordForm forced={session.user.mustChangePassword} name={session.user.name} />;
}
