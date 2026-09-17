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
import ContainerPage from './pages/WMS/container/container-page.tsx'
import PosPage from './pages/POS/orderslip/orderslip-page.tsx'
import OrderSlipDetailPage from './pages/POS/orderslip/orderslip-detail-page.tsx'
import CreateShipmentPage from './pages/WMS/container/create-shipment-page.tsx'
import ResolveDiscrepancyPage from './pages/WMS/container/resolve-discrepancy-page.tsx'
import DiscrepanciesPage from './pages/WMS/container/discrepancies-page.tsx'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider> 
        <BrowserRouter>
          <Routes>
            <Route index element={<LoginPage />} />
            
              <Route element={<AppLayout />}>   
                <Route path="/containers" element={<ContainerPage />} />
                <Route path="/containers/items" element={<CreateShipmentPage />} />
                <Route path="/containers/discrepancies" element={<DiscrepanciesPage />} />
                <Route path="/containers/:containerId/unload" element={<ResolveDiscrepancyPage />} />
                <Route path="/stock" element={<StockPage />} />
                <Route path="/order-slip" element={<PosPage/>}/>
                <Route path="/order-slip/:id" element={<OrderSlipDetailPage />} />
              </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)