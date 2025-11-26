'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header/Header'
import BottomNav from '@/components/BottomNav/BottomNav'
import ProfilePage from '@/components/ProfilePage/ProfilePage'
import FinanceModal from '@/components/FinanceModal/FinanceModal'
import SupportModal from '@/components/SupportModal/SupportModal'

export default function ProfileRoute() {
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false)
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false)

  useEffect(() => {
    setIsAnyModalOpen(isFinanceModalOpen || isSupportModalOpen || isSubscriptionModalOpen)
  }, [isFinanceModalOpen, isSupportModalOpen, isSubscriptionModalOpen])

  return (
    <>
      <Header />
      <ProfilePage onSubscriptionModalChange={setIsSubscriptionModalOpen} />
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

