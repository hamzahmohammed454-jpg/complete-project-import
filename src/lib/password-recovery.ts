export function validateRecoveryPassword(password: string, confirmation: string): string | null {
  if (password.length < 8) return "كلمة المرور يجب أن تكون 8 أحرف على الأقل";
  if (password !== confirmation) return "كلمتا المرور غير متطابقتين";
  return null;
}