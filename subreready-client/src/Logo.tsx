interface LogoProps {
  size?: number
}

export default function Logo({ size = 36 }: LogoProps) {
  return (
    <div
      className="flex items-center justify-center rounded-full bg-[#1D9E75] shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2L4 6v6c0 5.25 3.4 10.15 8 11.35C16.6 22.15 20 17.25 20 12V6l-8-4z"
          fill="white"
        />
        <path
          d="M9.5 12.5l2 2 4-4"
          stroke="#1D9E75"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
