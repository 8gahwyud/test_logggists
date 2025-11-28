'use client'

import { useState, useEffect, useMemo } from 'react'
import { useApp } from '@/lib/AppContext'
import InfoBlocks from './InfoBlocks'
import SearchBar from './SearchBar'
import FilterTabs from './FilterTabs'
import OrdersList from './OrdersList'
import OrderModal from '../OrderModal/OrderModal'
import FiltersModal from '../FiltersModal/FiltersModal'
import FinalizeOrderModal from '../FinalizeOrderModal/FinalizeOrderModal'
import styles from './OrdersPage.module.css'

export default function OrdersPage({ onModalStateChange }) {
  const { orders, currentOrderFilter, setCurrentOrderFilter, loadUserOrders, setIsAnyModalOpen, profile } = useApp()
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({
    metro: [],
    minRating: null,
    premiumOnly: false
  })
  const [finalizeData, setFinalizeData] = useState(null)
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false)
  
  // Простая проверка localStorage при каждом рендере
  useEffect(() => {
    const savedModal = localStorage.getItem('finalize_modal_data')
    if (savedModal && !isFinalizeModalOpen) {
      try {
        const modalData = JSON.parse(savedModal)
        console.log('[OrdersPage] Восстанавливаем модалку из localStorage:', modalData)
        setFinalizeData(modalData)
        setIsFinalizeModalOpen(true)
      } catch (e) {
        console.error('[OrdersPage] Ошибка парсинга модалки:', e)
        localStorage.removeItem('finalize_modal_data')
      }
    }
  })
  const [stats, setStats] = useState({
    activeOrders: 0,
    inWork: 0,
    availableOrders: 0
  })

  useEffect(() => {
    if (onModalStateChange) {
      onModalStateChange(isModalOpen)
    }
     // Уведомляем AppContext об открытии/закрытии модалки
     if (setIsAnyModalOpen) {
       setIsAnyModalOpen(isModalOpen || isFiltersOpen || isFinalizeModalOpen)
     }
   }, [isModalOpen, isFiltersOpen, isFinalizeModalOpen, onModalStateChange, setIsAnyModalOpen])

  useEffect(() => {
    // Обновляем статистику при изменении заказов
    updateStats(orders)
  }, [orders])

  // Загружаем заказы при монтировании компонента и при каждом показе страницы
  useEffect(() => {
    console.log('[OrdersPage] Компонент смонтирован, загружаем заказы')
    
    // Простая проверка localStorage при монтировании
    const checkForPendingFinalize = () => {
      const savedModal = localStorage.getItem('finalize_modal_data')
      if (savedModal) {
        try {
          const modalData = JSON.parse(savedModal)
          console.log('[OrdersPage] Найдена незавершенная модалка при монтировании:', modalData)
          setFinalizeData(modalData)
          setIsFinalizeModalOpen(true)
        } catch (e) {
          console.error('[OrdersPage] Ошибка парсинга модалки при монтировании:', e)
          localStorage.removeItem('finalize_modal_data')
        }
      }
    }
    
    // Проверяем сразу
    checkForPendingFinalize()
    
    // Загружаем заказы
    loadUserOrders()
    
    // Также загружаем при фокусе страницы (на случай если вернулись на вкладку)
    const handleFocus = () => {
      console.log('[OrdersPage] Страница получила фокус, обновляем заказы')
      loadUserOrders()
    }
    window.addEventListener('focus', handleFocus)
    
    // Обработка события открытия модалки заказа из уведомлений
    const handleOpenOrderModal = (event) => {
      const orderId = event.detail?.orderId
      const openChat = event.detail?.openChat
      if (orderId) {
        // Сохраняем в sessionStorage для обработки в useEffect
        sessionStorage.setItem('openOrderModal', orderId)
        if (openChat) {
          sessionStorage.setItem('openOrderChat', 'true')
        }
        // Обновляем заказы, чтобы useEffect мог найти заказ
        loadUserOrders()
      }
    }
    
    window.addEventListener('openOrderModal', handleOpenOrderModal)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('openOrderModal', handleOpenOrderModal)
    }
  }, [loadUserOrders])

  const updateStats = (ordersList) => {
    if (!ordersList || !Array.isArray(ordersList)) {
      setStats({ activeOrders: 0, inWork: 0, availableOrders: 0 })
      return
    }
    // В работе - заказы со статусом working/in_progress/accepted
    const inWork = ordersList.filter(o => 
      o.status === 'working' || 
      o.status === 'in_progress' || 
      o.status === 'accepted'
    ).length
    
    // Активные заказы - все заказы, которые не в работе и не завершены
    const active = ordersList.filter(o => 
      o.status !== 'working' && 
      o.status !== 'in_progress' && 
      o.status !== 'accepted' &&
      o.status !== 'completed' &&
      o.status !== 'cancelled'
    ).length
    
    // Сколько еще можно создать заказов по тарифу (из базы данных)
    const orderLimit = profile?.subscription?.order_limit || 5
    const availableOrders = Math.max(0, orderLimit - (profile?.daily_collected_count || 0))
    
    setStats({
      activeOrders: active,
      inWork: inWork,
      availableOrders: availableOrders
    })
  }

  const handleOrderClick = (order) => {
    setSelectedOrder(order)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedOrder(null)
  }

  // Обновляем selectedOrder когда обновляются заказы (чтобы модалка получала актуальные данные)
  useEffect(() => {
    if (selectedOrder && orders && orders.length > 0) {
      const updatedOrder = orders.find(o => String(o.id) === String(selectedOrder.id))
      if (updatedOrder) {
        setSelectedOrder(updatedOrder)
      }
    }
   }, [orders, selectedOrder?.id])
 
 
  // Обработка открытия модалки заказа из уведомлений
 useEffect(() => {
   if (orders && orders.length > 0 && !isFinalizeModalOpen) {
     const storedOrderId = sessionStorage.getItem('openOrderModal')
     const openChat = sessionStorage.getItem('openOrderChat') === 'true'
     if (storedOrderId) {
       const order = orders.find(o => String(o.id) === String(storedOrderId))
       if (order) {
         sessionStorage.removeItem('openOrderModal')
         sessionStorage.removeItem('openOrderChat')
         setSelectedOrder(order)
         setIsModalOpen(true)
         // Если нужно открыть чат, сохраняем флаг
         if (openChat) {
           setTimeout(() => {
             window.dispatchEvent(new CustomEvent('openOrderChat'))
           }, 300)
         }
       }
     }
   }
 }, [orders, isFinalizeModalOpen])

  // Фильтрация заказов по поиску и фильтрам
  const filteredOrders = useMemo(() => {
    let result = orders || []

    // Фильтр по статусу (активные/завершенные)
    if (currentOrderFilter === 'active') {
      result = result.filter(o => o.status !== 'completed' && o.status !== 'cancelled')
    } else if (currentOrderFilter === 'finished') {
      result = result.filter(o => o.status === 'completed')
    }

    // Поиск по тексту
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter(order => {
        const title = (order.title || '').toLowerCase()
        const description = (order.description || '').toLowerCase()
        const location = (order.location || '').toLowerCase()
        const metro = (order.metro_station || '').toLowerCase()
        return title.includes(query) || 
               description.includes(query) || 
               location.includes(query) ||
               metro.includes(query)
      })
    }

    // Фильтр по метро
    if (filters.metro.length > 0) {
      result = result.filter(order => 
        filters.metro.includes(order.metro_station)
      )
    }

    // Фильтр по рейтингу логиста
    if (filters.minRating !== null) {
      result = result.filter(order => {
        // Рейтинг может быть в разных местах в зависимости от структуры ответа
        const logistRating = order.logist?.rating || 
                            order.created_by?.rating || 
                            (typeof order.rating === 'number' ? order.rating : 50)
        return Number(logistRating) >= filters.minRating
      })
    }

    // Фильтр по премиум
    if (filters.premiumOnly) {
      result = result.filter(order => order.premium === true)
    }

    return result
  }, [orders, currentOrderFilter, searchQuery, filters])

   const handleApplyFilters = (newFilters) => {
     setFilters(newFilters)
   }

   const handleFinalizeComplete = () => {
     // Удаляем из localStorage только после успешного завершения
     localStorage.removeItem('finalize_modal_data')
     localStorage.removeItem('finalize_modal_ratings')
     localStorage.removeItem('finalize_modal_expanded')
     console.log('[OrdersPage] Модалка завершена, данные удалены из localStorage')
     
     // Закрываем обе модалки
     setIsFinalizeModalOpen(false)
     setFinalizeData(null)
     setIsModalOpen(false)
     setSelectedOrder(null)
     
     // Обновляем заказы после завершения
     loadUserOrders()
   }


    return (
      <main className={styles.main}>
        <InfoBlocks stats={stats} />
        
        
        <SearchBar 
          onSearch={setSearchQuery}
          onFilterClick={() => setIsFiltersOpen(true)}
          hasActiveFilters={filters.metro.length > 0 || filters.minRating !== null || filters.premiumOnly}
        />
      <FilterTabs 
        currentFilter={currentOrderFilter} 
        setCurrentFilter={setCurrentOrderFilter} 
      />
      <OrdersList 
        orders={filteredOrders}
        filter={currentOrderFilter}
        onOrderClick={handleOrderClick}
      />
      <FiltersModal
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        onApply={handleApplyFilters}
        orders={orders}
       />
             {isModalOpen && selectedOrder && (
               <OrderModal
                 key={selectedOrder.id} // Пересоздаем модалку при изменении заказа
                 order={selectedOrder}
                 onClose={handleCloseModal}
                 onUpdate={() => {
                   if (loadUserOrders) {
                     loadUserOrders()
                   }
                 }}
                 onModalStateChange={onModalStateChange}
               />
             )}
             {isFinalizeModalOpen && finalizeData && (
               <FinalizeOrderModal
                 data={finalizeData}
                 onClose={() => {
                   // НЕ ЗАКРЫВАЕМ модалку - она должна быть незакрываемой
                   console.log('[OrdersPage] Попытка закрыть FinalizeOrderModal заблокирована')
                 }}
                 onComplete={handleFinalizeComplete}
               />
             )}
    </main>
  )
}

