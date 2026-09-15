import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { AppLayout } from './common/components/app-layout/app-layout.tsx'
import { ThemeProvider } from './common/context/theme-context.tsx'
import LoginPage from './pages/login/login-page.tsx'

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './utils/query-client.ts'
import StockPage from './pages/WMS/stock/stock-page.tsx'
import TruckPage from './pages/WMS/truck/truck-page.tsx'
import SupplierPage from './pages/WMS/supplier/supplier-page.tsx'
import ContainerPage from './pages/WMS/container/container-page.tsx'
import PosPage from './pages/POS/orderslip/orderslip-page.tsx'
import OrderSlipDetailPage from './pages/POS/orderslip/orderslip-detail-page.tsx'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider> 
        <BrowserRouter>
          <Routes>
            <Route index element={<LoginPage />} />
            
              <Route element={<AppLayout />}>   
                <Route path="/container" element={<ContainerPage />} />
                <Route path="/supplier" element={<SupplierPage />} />
                <Route path="/stock" element={<StockPage />} />
                <Route path="/truck" element={<TruckPage />} />
                <Route path="/order-slip" element={<PosPage/>}/>
                <Route path="/order-slip/:id" element={<OrderSlipDetailPage />} />
              </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)