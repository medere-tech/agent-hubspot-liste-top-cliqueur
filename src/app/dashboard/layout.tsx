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
      <Sidebar
        userEmail={session?.user?.email}
        userName={session?.user?.name}
        userRole={session?.user?.role}
      />
      <main className="lg:ml-[240px] min-h-screen pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  )
}
