import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Logo from './Logo'

interface PageShellProps {
  children: ReactNode
  footer?: ReactNode
}

export default function PageShell({ children, footer }: PageShellProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-1">
          <Logo />
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">SubReady</h1>
        </div>
        {children}
      </div>
      {footer}
    </div>
  )
}

export function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <p className="text-xs text-gray-400 mt-5 text-center">
      <Link to={to} className="hover:text-[#1D9E75] transition-colors">
        {children}
      </Link>
    </p>
  )
}
