import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import { AppLayout } from './common/components/app-layout/app-layout.tsx'
import { ThemeProvider } from './common/context/theme-context.tsx'
import { LanguageProvider } from './common/context/language-context.tsx'
import LoginPage from './pages/login/login-page.tsx'

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './utils/query-client.ts'
import StockPage from './pages/WMS/stock/stock-page.tsx'
import StockLogPage from './pages/WMS/inventory/stock-log-page.tsx'
import ContainerPage from './pages/WMS/container/container-page.tsx'
import DeliveryPage from './pages/WMS/delivery/delivery-page.tsx'
import CreateDeliveryPage from './pages/WMS/delivery/create-delivery-page.tsx'
import PosPage from './pages/POS/orderslip/orderslip-page.tsx'
import OrderSlipDetailPage from './pages/POS/orderslip/orderslip-detail-page.tsx'
import CreateOrderSlipPage from './pages/POS/orderslip/create-orderslip-page.tsx'
import EditOrderSlipPage from './pages/POS/orderslip/edit-orderslip-page.tsx'
import OrderSlipTrashPage from './pages/POS/orderslip/orderslip-trash-page.tsx'
import OrderSlipSummaryPage from './pages/POS/summary/summary-page.tsx'
import CashierPage from './pages/POS/cashier/cashier-page.tsx'
import CreateShipmentPage from './pages/WMS/container/create-shipment-page.tsx'
import ResolveDiscrepancyPage from './pages/WMS/container/resolve-discrepancy-page.tsx'
import DiscrepanciesPage from './pages/WMS/discrepancy/discrepancies-page.tsx'
import ReportsPage from './pages/WMS/reports/reports-page.tsx'
import SupplierPage from './pages/WMS/supplier/supplier-page.tsx'
import ShippingCompanyPage from './pages/WMS/shipping-company/shipping-company-page.tsx'
import AuditLogPage from './pages/audit/audit-log-page.tsx'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <BrowserRouter>
          <Routes>
            <Route index element={<LoginPage />} />
            
              <Route element={<AppLayout />}>   
                <Route path="/containers" element={<ContainerPage kind="INTERNATIONAL" />} />
                <Route path="/national" element={<ContainerPage kind="NATIONAL" />} />
                <Route path="/containers/items" element={<CreateShipmentPage kind="INTERNATIONAL" />} />
                <Route path="/national/items" element={<CreateShipmentPage kind="NATIONAL" />} />
                <Route path="/containers/:shipmentId/edit" element={<CreateShipmentPage kind="INTERNATIONAL" />} />
                <Route path="/national/:shipmentId/edit" element={<CreateShipmentPage kind="NATIONAL" />} />
                <Route path="/discrepancies" element={<DiscrepanciesPage />} />
                <Route path="/containers/:containerId/unload" element={<ResolveDiscrepancyPage />} />
                <Route path="/deliveries" element={<DeliveryPage />} />
                <Route path="/suppliers" element={<SupplierPage />} />
                <Route path="/shipping-companies" element={<ShippingCompanyPage />} />
                <Route path="/deliveries/new" element={<CreateDeliveryPage />} />
                <Route path="/stock" element={<StockPage />} />
                <Route path="/inventory" element={<StockLogPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/order-slip" element={<PosPage/>}/>
                <Route path="/order-slip/new" element={<CreateOrderSlipPage />} />
                <Route path="/order-slip/trash" element={<OrderSlipTrashPage />} />
                <Route path="/order-slip/:id" element={<OrderSlipDetailPage />} />
                <Route path="/order-slip/:id/edit" element={<EditOrderSlipPage />} />
                <Route path="/order-summary" element={<OrderSlipSummaryPage />} />
                <Route path="/cashiers" element={<CashierPage />} />
                <Route path="/audit-log" element={<AuditLogPage />} />
              </Route>
          </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  </StrictMode>,
)
