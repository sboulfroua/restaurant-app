import React, { useState } from 'react';

const ManagerPanel = () => {
  const [stats] = useState({
    totalSales: 3450,
    totalOrders: 42,
    activeTables: 6
  });

  return (
    <div className="max-w-6xl mx-auto" dir="rtl">
      <h2 className="text-2xl font-bold mb-6 text-slate-800">لوحة تحكم المدير</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-gray-500 text-sm font-semibold">مبيعات اليوم الإجمالية</p>
          <h3 className="text-3xl font-extrabold text-slate-800 mt-2">{stats.totalSales} درهم</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-gray-500 text-sm font-semibold">عدد الطلبات المكتملة</p>
          <h3 className="text-3xl font-extrabold text-slate-800 mt-2">{stats.totalOrders} طلبات</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-gray-500 text-sm font-semibold">الطاولات النشطة الآن</p>
          <h3 className="text-3xl font-extrabold text-amber-600 mt-2">{stats.activeTables} طاولات</h3>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-2">إدارة المنيو والخدمات</h3>
        <p className="text-gray-600 text-sm">من هذه الشاشة يمكنك إضافة تعديلات القائمة، طباعة أكواد QR للطاولات، ومتابعة الأداء المالي لخدمة المطعم.</p>
      </div>
    </div>
  );
};

export default ManagerPanel;