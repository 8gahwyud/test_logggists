'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header/Header'
import BottomNav from '@/components/BottomNav/BottomNav'
import CreateOrderPage from '@/components/CreateOrderPage/CreateOrderPage'
import FinanceModal from '@/components/FinanceModal/FinanceModal'
import SupportModal from '@/components/SupportModal/SupportModal'

export default function CreateRoute() {
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false)
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false)
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false)

  useEffect(() => {
    setIsAnyModalOpen(isFinanceModalOpen || isSupportModalOpen)
  }, [isFinanceModalOpen, isSupportModalOpen])

  return (
    <>
      <Header />
      <CreateOrderPage />
      {!isAnyModalOpen && (
        <BottomNav 
          onFinanceClick={() => setIsFinanceModalOpen(true)}
          onSupportClick={() => setIsSupportModalOpen(true)}
        />
      )}
      {isFinanceModalOpen && (
        <FinanceModal 
          onClose={() => setIsFinanceModalOpen(false)} 
        />
      )}
      {isSupportModalOpen && (
        <SupportModal 
          onClose={() => setIsSupportModalOpen(false)} 
        />
      )}
    </>
  )
}







