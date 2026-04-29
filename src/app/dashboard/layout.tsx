import Sidebar from '@/components/sidebar'
import { auth } from '@/lib/auth'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Sidebar userEmail={session?.user?.email} />
      <main className="ml-[240px] min-h-screen">
        {children}
      </main>
    </div>
  )
}
