import "./globals.css";

export const metadata = {
  title: "USD24-USDC Swap | Arbitrum",
  description: "Swap between USD24 and USDC on Arbitrum",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
