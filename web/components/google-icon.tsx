import type { SVGProps } from "react"

// Google "G" multicolor mark used for the "Continue with Google" controls on
// the Login and Signup pages.
export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.46h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.73Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.01c-1.08.72-2.45 1.16-4.06 1.16-3.12 0-5.76-2.11-6.71-4.94H1.29v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.31a7.2 7.2 0 0 1 0-4.62v-3.1H1.29a12 12 0 0 0 0 10.82l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.74c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.29 6.59l4 3.1C6.24 6.85 8.88 4.74 12 4.74Z"
      />
    </svg>
  )
}
