import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import CustomerMenu from './components/CustomerMenu';
import KitchenDashboard from './components/KitchenDashboard';
import ManagerPanel from './components/ManagerPanel';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100 font-sans">
        <Routes>
          {/* رابط المنيو للزبائن عبر الـ QR code والطاولة */}
          <Route path="/menu/table/:tableId" element={<CustomerMenu />} />
          <Route path="/menu" element={<CustomerMenu />} />

          {/* رابط شاشة المطبخ والنادل */}
          <Route path="/kitchen" element={<KitchenDashboard />} />

          {/* رابط لوحة الإدارة */}
          <Route path="/admin" element={<ManagerPanel />} />

          {/* التوجيه التلقائي للمنيو عند فتح الصفحة الرئيسية */}
          <Route path="*" element={<Navigate to="/menu/table/1" replace />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;