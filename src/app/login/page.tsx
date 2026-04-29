'use client'

import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim())
}

function isValidPassword(value: string): boolean {
  return value.length >= 8
}

export default function LoginPage() {
  const router = useRouter()

  const [emailValue, setEmailValue] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [emailTouched, setEmailTouched] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [loading, setLoading] = useState(false)

  const emailError =
    emailTouched && !isValidEmail(emailValue) ? 'Format email invalide.' : ''
  const passwordError =
    passwordTouched && !isValidPassword(passwordValue)
      ? 'Minimum 8 caractères requis.'
      : ''
  const isFormValid = isValidEmail(emailValue) && isValidPassword(passwordValue)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isFormValid || loading) return

    setLoading(true)
    setAuthError('')

    const result = await signIn('credentials', {
      email: emailValue.trim(),
      password: passwordValue,
      redirect: false,
    })

    if (result?.error) {
      setAuthError('Email ou mot de passe incorrect.')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[400px]">

        {/* Logo */}
        <div className="flex justify-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logo-medere-black.png"
            alt="Médéré"
            style={{ maxWidth: '140px', height: 'auto' }}
          />
        </div>

        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-[22px] font-semibold text-[#0a0a0a] leading-tight tracking-tight">
            Connexion
          </h1>
          <p className="text-sm text-[#737373] mt-1.5 leading-relaxed">
            Accédez à votre espace d&apos;analyse campagnes.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide"
            >
              Adresse email
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <rect x="1" y="3" width="13" height="9" rx="1.5" stroke="#a3a3a3" strokeWidth="1.2" />
                  <path d="M1.5 4l6 4.5L13.5 4" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                required
                disabled={loading}
                value={emailValue}
                onChange={(e) => {
                  setEmailValue(e.target.value)
                  if (emailTouched) {
                    // re-validate live after first blur
                  }
                }}
                onBlur={() => setEmailTouched(true)}
                className={`w-full pl-9 pr-3 py-2.5 border bg-white text-sm text-[#0a0a0a] placeholder-[#a3a3a3] rounded-[4px] outline-none transition-all duration-150 disabled:opacity-50 ${
                  emailError
                    ? 'border-red-400 ring-1 ring-red-400'
                    : 'border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]'
                }`}
                placeholder="prenom.nom@medere.fr"
              />
            </div>
            {emailError && (
              <p className="mt-1 text-xs text-red-600">{emailError}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-[#0a0a0a] mb-1.5 tracking-wide"
            >
              Mot de passe
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <rect x="2.5" y="6" width="10" height="7.5" rx="1.5" stroke="#a3a3a3" strokeWidth="1.2" />
                  <path d="M5 6V4.5a2.5 2.5 0 0 1 5 0V6" stroke="#a3a3a3" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="7.5" cy="9.75" r="1" fill="#a3a3a3" />
                </svg>
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                disabled={loading}
                value={passwordValue}
                onChange={(e) => {
                  setPasswordValue(e.target.value)
                }}
                onBlur={() => setPasswordTouched(true)}
                className={`w-full pl-9 pr-10 py-2.5 border bg-white text-sm text-[#0a0a0a] placeholder-[#a3a3a3] rounded-[4px] outline-none transition-all duration-150 disabled:opacity-50 ${
                  passwordError
                    ? 'border-red-400 ring-1 ring-red-400'
                    : 'border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a]'
                }`}
                placeholder="••••••••"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#a3a3a3] hover:text-[#0a0a0a] transition-colors"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? (
                  // Eye-off (password visible → cliquer pour masquer)
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 7.5S3.5 3 7.5 3s6.5 4.5 6.5 4.5S11.5 12 7.5 12 1 7.5 1 7.5Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                    <circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M2 2l11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                ) : (
                  // Eye (password masqué → cliquer pour afficher)
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M1 7.5S3.5 3 7.5 3s6.5 4.5 6.5 4.5S11.5 12 7.5 12 1 7.5 1 7.5Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                    <circle cx="7.5" cy="7.5" r="1.75" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                )}
              </button>
            </div>
            {passwordError && (
              <p className="mt-1 text-xs text-red-600">{passwordError}</p>
            )}
          </div>

          {/* Auth error */}
          {authError && (
            <div className="flex items-center gap-2.5 px-3 py-2.5 border border-red-200 bg-red-50 rounded-[4px]">
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="shrink-0"
                aria-hidden="true"
              >
                <circle cx="7" cy="7" r="5.5" stroke="#ef4444" strokeWidth="1.2" />
                <path d="M7 4.5v3M7 9.5v.2" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              <span className="text-xs text-red-700">{authError}</span>
            </div>
          )}

          {/* Submit */}
          <div className="pt-1">
            <button
              type="submit"
              disabled={!isFormValid || loading}
              className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-[4px] transition-all duration-200 ${
                isFormValid && !loading
                  ? 'bg-[#0a0a0a] text-white hover:bg-[#1a1a1a] cursor-pointer'
                  : 'bg-[#e5e5e5] text-[#a3a3a3] cursor-not-allowed'
              }`}
            >
              {loading ? (
                <>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="animate-spin"
                    aria-hidden="true"
                  >
                    <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
                    <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Connexion en cours…
                </>
              ) : (
                'Se connecter'
              )}
            </button>
          </div>
        </form>

        {/* Footer */}
        <p className="mt-10 text-center text-xs text-[#a3a3a3]">
          Accès réservé à l&apos;équipe Médéré.
        </p>

      </div>
    </div>
  )
}
