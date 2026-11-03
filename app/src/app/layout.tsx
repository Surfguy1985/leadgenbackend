export const metadata = { title: "Archangel Advertising — Dashboard", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: 24, maxWidth: 1100 }}>{children}</body></html>;
}
