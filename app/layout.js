import './globals.css';

export const metadata = {
  title: 'Order Tracking System',
  description: 'Order tracking and inventory management system for warehouse team',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
