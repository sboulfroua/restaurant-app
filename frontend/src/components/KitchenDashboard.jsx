import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

// رابط السيرفر المرفوع على Back4App
const socket = io('https://restaurantapp-pjw6hote.b4a.run/');

// دالة التنبيه الصوتي الحاد والمجرب للمطبخ
const playHighKitchenBell = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const playTone = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);
      gain.gain.setValueAtTime(0.9, audioCtx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + startTime);
      osc.stop(audioCtx.currentTime + startTime + duration);
    };

    playTone(987.77, 0, 0.15);
    playTone(1318.51, 0.18, 0.15);
    playTone(1760.00, 0.36, 0.4);
  } catch (e) {
    console.log('Audio error:', e);
  }
};

function KitchenDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState('orders'); // orders | menu | archive
  const [orderFilter, setOrderFilter] = useState('all'); // all | dine_in | delivery

  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // بيانات الأرشيف والمبيعات
  const [archivedOrders, setArchivedOrders] = useState([]);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);

  const [newDish, setNewDish] = useState({ name: '', price: '', category: 'أطباق رئيسية', image: '' });
  const [customMenu, setCustomMenu] = useState([]);

  useEffect(() => {
    const handleMenuUpdate = (menu) => setCustomMenu(Array.isArray(menu) ? menu : []);
    const handleArchiveUpdate = (data) => {
      setArchivedOrders(data.archive || []);
      setTodayTotal(data.todayTotal || 0);
      setMonthTotal(data.monthTotal || 0);
    };

    socket.on('current_menu', handleMenuUpdate);
    socket.on('archive_data', handleArchiveUpdate);

    socket.on('receive_order', (newOrder) => {
      setOrders((prev) => [newOrder, ...prev]);
      playHighKitchenBell();
    });

    socket.on('waiter_called', (data) => {
      setNotifications((prev) => [`🔔 الطاولة #${data.tableId} تطلب النادل (${data.time})`, ...prev]);
      playHighKitchenBell();
    });

    socket.on('dish_added', (newDish) => {
      setCustomMenu((prev) => {
        if (prev.some((item) => item.id === newDish.id)) return prev;
        if (prev.length >= 100) return prev;
        return [...prev, newDish];
      });
    });

    return () => {
      socket.off('current_menu', handleMenuUpdate);
      socket.off('archive_data', handleArchiveUpdate);
      socket.off('receive_order');
      socket.off('waiter_called');
      socket.off('dish_added');
    };
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginForm.username === 'admin' && loginForm.password === '123456') {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('اسم المستخدم أو كلمة السر غير صحيحة!');
    }
  };

  const enableAudio = () => {
    playHighKitchenBell();
    setSoundEnabled(true);
  };

  const updateStatus = (orderId, newStatus) => {
    const targetOrder = archivedOrders.find((o) => o.id === orderId) || orders.find((o) => o.id === orderId);
    if (targetOrder) {
      const updated = { ...targetOrder, status: newStatus };
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      socket.emit('update_status', updated);
    }
  };

  // دالة طباعة الفاتورة / الوصل
  const handlePrintOrder = (order) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    const itemsRows = order.items
      .map(
        (item) => `
      <tr>
        <td style="padding: 6px 0; border-bottom: 1px dashed #eee;">${item.name} (x${item.quantity})</td>
        <td style="padding: 6px 0; border-bottom: 1px dashed #eee; text-align: left; font-weight: bold;">${
          item.price * item.quantity
        } د.م</td>
      </tr>
    `
      )
      .join('');

    const customerDetails =
      order.orderType === 'delivery'
        ? `
      <div style="background: #f9f9f9; padding: 8px; border-radius: 6px; margin: 10px 0; font-size: 12px;">
        <p style="margin:2px 0;"><strong>نوع الطلب:</strong> توصيل خارجي 🛵</p>
        <p style="margin:2px 0;"><strong>العميل:</strong> ${order.customerName || '-'}</p>
        <p style="margin:2px 0;"><strong>الهاتف:</strong> ${order.customerPhone || '-'}</p>
        <p style="margin:2px 0;"><strong>العنوان:</strong> ${order.customerAddress || '-'}</p>
        <p style="margin:2px 0;"><strong>رسوم التوصيل:</strong> 15 د.م</p>
      </div>
    `
        : `
      <p style="font-size: 14px; margin: 5px 0;"><strong>نوع الطلب:</strong> داخل المطعم (طاولة #${order.tableId})</p>
    `;

    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>طباعة طلب #${order.id}</title>
          <style>
            body { font-family: system-ui, sans-serif; width: 280px; padding: 10px; margin: 0 auto; color: #111; }
            h2 { text-align: center; margin-bottom: 2px; font-size: 18px; }
            .header-info { text-align: center; font-size: 11px; color: #555; margin-bottom: 10px; }
            table { width: 100%; font-size: 12px; border-collapse: collapse; margin-top: 10px; }
            .total-box { border-top: 2px solid #000; font-weight: bold; font-size: 15px; margin-top: 10px; padding-top: 8px; display: flex; justify-content: space-between; }
          </style>
        </head>
        <body>
          <h2>وصْل المطبخ / الفاتورة</h2>
          <div class="header-info">
            <p style="margin:0;">رقم الطلب: #${order.id}</p>
            <p style="margin:0;">الوقت: ${order.createdAt || new Date().toLocaleTimeString('ar-MA')}</p>
          </div>
          ${customerDetails}
          <table>
            <thead>
              <tr style="border-bottom: 1px solid #000; text-align: right;">
                <th>الصنف</th>
                <th style="text-align: left;">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          <div class="total-box">
            <span>المجموع الكلي:</span>
            <span>${order.total} د.م</span>
          </div>
          ${
            order.note
              ? `<div style="margin-top: 10px; font-size: 11px; background: #fff3cd; padding: 6px; border-radius: 4px;"><strong>ملاحظة:</strong> ${order.note}</div>`
              : ''
          }
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // إدارة تحديد وإلغاء تحديد الأرشيف
  const handleSelectAllArchive = (e) => {
    if (e.target.checked) {
      setSelectedArchiveIds(archivedOrders.map((o) => o.id));
    } else {
      setSelectedArchiveIds([]);
    }
  };

  const handleSelectArchiveItem = (id) => {
    setSelectedArchiveIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedArchive = () => {
    if (selectedArchiveIds.length === 0) return;
    if (window.confirm(`هل أنت تأكد من حذف ${selectedArchiveIds.length} طلبات محددة من الأرشيف؟`)) {
      const remaining = archivedOrders.filter((o) => !selectedArchiveIds.includes(o.id));
      setArchivedOrders(remaining);
      socket.emit('delete_archived_orders', selectedArchiveIds);
      setSelectedArchiveIds([]);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setNewDish((prev) => ({ ...prev, image: reader.result }));
      reader.readAsDataURL(file);
    }
  };

  const handleAddDish = (e) => {
    e.preventDefault();
    if (!newDish.name || !newDish.price) return;
    if (customMenu.length >= 100) {
      alert('عذراً، لقد وصلت الحد الأقصى للمنيو (100 طبق)!');
      return;
    }

    const createdDish = {
      id: Date.now(),
      name: newDish.name,
      price: Number(newDish.price),
      category: newDish.category,
      image: newDish.image,
    };

    socket.emit('add_new_dish', createdDish);
    setNewDish({ name: '', price: '', category: 'أطباق رئيسية', image: '' });
    alert('تم إضافة الطبق بنجاح!');
  };

  const filteredOrders = orders.filter((o) => {
    if (orderFilter === 'dine_in') return o.orderType !== 'delivery';
    if (orderFilter === 'delivery') return o.orderType === 'delivery';
    return true;
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-slate-800">دخول شاشة المطبخ</h1>
            <p className="text-sm text-slate-500 mt-1">أدخل بيانات الاعتماد للمتابعة</p>
          </div>

          {loginError && (
            <div className="bg-red-50 text-red-600 text-sm font-bold p-3 rounded-xl mb-4 border border-red-200 text-center">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">اسم المستخدم</label>
              <input
                type="text"
                required
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                placeholder="admin"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">كلمة السر</label>
              <input
                type="password"
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                placeholder="••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-black py-3.5 rounded-xl shadow-lg transition cursor-pointer"
            >
              تسجيل الدخول 🚀
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex" dir="rtl">
      {/* القائمة الجانبية */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-4 shadow-xl shrink-0">
        <div>
          <div className="p-4 border-b border-slate-800 mb-6 text-center">
            <h1 className="text-xl font-black text-amber-400">لوحة المطبخ</h1>
            <p className="text-xs text-slate-400 mt-1">إدارة الطلبات والأطباق ({customMenu.length}/100)</p>
          </div>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('orders')}
              className={`w-full text-right py-3 px-4 rounded-xl font-bold transition cursor-pointer flex items-center gap-3 ${
                activeTab === 'orders' ? 'bg-amber-500 text-slate-900' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span>🍳</span> الطلبات الحية ({orders.length})
            </button>

            <button
              onClick={() => setActiveTab('menu')}
              className={`w-full text-right py-3 px-4 rounded-xl font-bold transition cursor-pointer flex items-center gap-3 ${
                activeTab === 'menu' ? 'bg-amber-500 text-slate-900' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span>➕</span> إضافة طبق وصورة ({customMenu.length})
            </button>

            <button
              onClick={() => setActiveTab('archive')}
              className={`w-full text-right py-3 px-4 rounded-xl font-bold transition cursor-pointer flex items-center gap-3 ${
                activeTab === 'archive' ? 'bg-amber-500 text-slate-900' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span>📊</span> أرشيف ومبيعات اليوم/الشهر
            </button>
          </nav>
        </div>

        <button
          onClick={() => setIsAuthenticated(false)}
          className="w-full bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white py-2.5 px-4 rounded-xl font-bold text-sm transition cursor-pointer border border-red-500/30"
        >
          تسجيل الخروج 🚪
        </button>
      </aside>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 p-6 overflow-y-auto">
        {/* الهيدر العلوي */}
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm mb-6 border border-slate-200">
          <div>
            <h2 className="text-xl font-black text-slate-800">
              {activeTab === 'orders' && 'الطلبات الحية المباشرة'}
              {activeTab === 'menu' && 'إدارة المنيو وإضافة أطباق صور'}
              {activeTab === 'archive' && 'أرشيف وتفاصيل المبيعات'}
            </h2>
          </div>

          {!soundEnabled ? (
            <button
              onClick={enableAudio}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-xl shadow-md transition animate-pulse cursor-pointer text-xs"
            >
              🔊 تفعيل التنبيهات الصوتية
            </button>
          ) : (
            <span className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-xl text-xs border border-emerald-300">
              ✅ الصوت مفعّل
            </span>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="mb-6 space-y-2">
            {notifications.map((note, idx) => (
              <div key={idx} className="bg-amber-100 border-l-4 border-amber-500 text-amber-900 p-3 rounded shadow-sm flex justify-between items-center text-sm">
                <span className="font-bold">{note}</span>
                <button
                  onClick={() => setNotifications((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-amber-700 font-bold text-xs cursor-pointer"
                >
                  تجاهل
                </button>
              </div>
            ))}
          </div>
        )}

        {/* تبويب الطلبات الحية */}
        {activeTab === 'orders' && (
          <div>
            {/* فلترة نوع الطلب */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={() => setOrderFilter('all')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  orderFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border'
                }`}
              >
                الكل ({orders.length})
              </button>
              <button
                onClick={() => setOrderFilter('dine_in')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  orderFilter === 'dine_in' ? 'bg-amber-500 text-slate-900' : 'bg-white text-slate-600 border'
                }`}
              >
                🍽️ داخل المطعم ({orders.filter((o) => o.orderType !== 'delivery').length})
              </button>
              <button
                onClick={() => setOrderFilter('delivery')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  orderFilter === 'delivery' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border'
                }`}
              >
                🛵 طلبات التوصيل الخارجية ({orders.filter((o) => o.orderType === 'delivery').length})
              </button>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl shadow-sm border text-gray-400">
                لا توجد طلبات حية في هذه الفئة حالياً...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOrders.map((order) => (
                  <div
                    key={order.id}
                    className={`bg-white rounded-2xl shadow-md border-2 p-5 flex flex-col justify-between ${
                      order.status === 'pending'
                        ? 'border-amber-400'
                        : order.status === 'preparing'
                        ? 'border-blue-400'
                        : 'border-emerald-400'
                    }`}
                  >
                    <div>
                      {/* الهيدر مع زر الطباعة */}
                      <div className="flex justify-between items-start border-b pb-3 mb-3">
                        <div>
                          {order.orderType === 'delivery' ? (
                            <span className="bg-blue-100 text-blue-800 text-xs font-black px-2.5 py-1 rounded-lg">
                              🛵 طلب توصيل خارجي
                            </span>
                          ) : (
                            <span className="text-lg font-black text-slate-900">طاولة #{order.tableId}</span>
                          )}
                          <div className="text-xs text-gray-400 font-bold mt-1">{order.createdAt}</div>
                        </div>

                        <button
                          onClick={() => handlePrintOrder(order)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 border"
                          title="طباعة الفاتورة"
                        >
                          🖨️ طباعة
                        </button>
                      </div>

                      {/* تفاصيل التوصيل الخارجي إن وجد */}
                      {order.orderType === 'delivery' && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-xs text-slate-700 space-y-1">
                          <p><strong>الاسم:</strong> {order.customerName || 'غير محدد'}</p>
                          <p><strong>الهاتف:</strong> <a href={`tel:${order.customerPhone}`} className="text-blue-600 underline font-bold">{order.customerPhone || '-'}</a></p>
                          <p><strong>العنوان:</strong> {order.customerAddress || '-'}</p>
                          <p className="text-amber-700 font-bold">🚚 مصاريف التوصيل: 15 درهم</p>
                        </div>
                      )}

                      {/* الأصناف */}
                      <div className="space-y-2 mb-3">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="font-bold text-slate-800">{item.name}</span>
                            <span className="font-black text-amber-600">x{item.quantity}</span>
                          </div>
                        ))}
                      </div>

                      {order.note && (
                        <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 mb-3 text-xs text-amber-900 font-bold">
                          💬 ملاحظة: {order.note}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="border-t pt-3 flex justify-between items-center mb-4">
                        <span className="font-bold text-slate-600">المجموع الكلي:</span>
                        <span className="font-black text-emerald-600 text-lg">{order.total} درهم</span>
                      </div>

                      <div className="flex gap-2">
                        {order.status === 'pending' && (
                          <button
                            onClick={() => updateStatus(order.id, 'preparing')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-sm cursor-pointer transition shadow"
                          >
                            بدء التحضير 🍳
                          </button>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => updateStatus(order.id, 'completed')}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-sm cursor-pointer transition shadow"
                          >
                            جاهز للتقديم 🍽️
                          </button>
                        )}
                        {order.status === 'completed' && (
                          <span className="w-full text-center bg-emerald-100 text-emerald-800 py-2.5 rounded-xl font-bold text-sm">
                            تم التسليم ✅
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* تبويب إضافة المنيو */}
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-black text-slate-800 mb-4">إضافة طبق جديد للمنيو ({customMenu.length}/100)</h3>
              <form onSubmit={handleAddDish} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">اسم الطبق</label>
                  <input
                    type="text"
                    required
                    value={newDish.name}
                    onChange={(e) => setNewDish({ ...newDish, name: e.target.value })}
                    className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-sm"
                    placeholder="مثال: طاجين دجاج بالحامض"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">السعر (درهم)</label>
                    <input
                      type="number"
                      required
                      value={newDish.price}
                      onChange={(e) => setNewDish({ ...newDish, price: e.target.value })}
                      className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-sm"
                      placeholder="60"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">التصنيف</label>
                    <select
                      value={newDish.category}
                      onChange={(e) => setNewDish({ ...newDish, category: e.target.value })}
                      className="w-full p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold text-sm"
                    >
                      <option value="أطباق رئيسية">أطباق رئيسية</option>
                      <option value="مقبلات">مقبلات</option>
                      <option value="مشروبات">مشروبات</option>
                      <option value="حلويات">حلويات</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">تحميل صورة الطبق من الجهاز</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="w-full p-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-500"
                  />
                  {newDish.image && (
                    <img src={newDish.image} alt="معاينة" className="mt-3 h-28 w-full object-cover rounded-xl border" />
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-slate-800 transition cursor-pointer text-sm"
                >
                  حفظ وإضافة الطبق ➕
                </button>
              </form>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-black text-slate-800 mb-4">الأطباق المضافة ({customMenu.length}/100)</h3>
              <div className="space-y-3 max-h-[450px] overflow-y-auto">
                {customMenu.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">لم يتم إضافة أي أطباق بعد.</p>
                ) : (
                  customMenu.map((item) => (
                    <div key={item.id} className="flex items-center gap-4 p-3 border rounded-2xl">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-16 h-16 rounded-xl object-cover" />
                      ) : (
                        <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 font-bold text-xs">
                          لا صورة
                        </div>
                      )}
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-800 text-sm">{item.name}</h4>
                        <p className="text-xs text-amber-600 font-bold">{item.category}</p>
                        <span className="font-black text-slate-900 text-sm">{item.price} درهم</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* تبويب الأرشيف وإدارة الحذف */}
        {activeTab === 'archive' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <p className="text-xs font-bold text-slate-500 mb-1">إجمالي طلبات السجل</p>
                <h3 className="text-3xl font-black text-slate-800">{archivedOrders.length} طلبات</h3>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <p className="text-xs font-bold text-slate-500 mb-1">مبيعات اليوم الإجمالية</p>
                <h3 className="text-3xl font-black text-emerald-600">{todayTotal} درهم</h3>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <p className="text-xs font-bold text-slate-500 mb-1">مبيعات الشهر الحالية</p>
                <h3 className="text-3xl font-black text-amber-600">{monthTotal} درهم</h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-black text-slate-800">سجل الطلبات الكامل الدائم</h3>

                {/* زر حذف الطلبات المحددة */}
                {selectedArchiveIds.length > 0 && (
                  <button
                    onClick={handleDeleteSelectedArchive}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-xl text-xs shadow transition cursor-pointer flex items-center gap-2"
                  >
                    🗑️ حذف الطلبات المحددة ({selectedArchiveIds.length})
                  </button>
                )}
              </div>

              {archivedOrders.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">لا يوجد طلبات أرشيفية بعد.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b text-slate-400 font-bold">
                        <th className="pb-3 w-10">
                          <input
                            type="checkbox"
                            onChange={handleSelectAllArchive}
                            checked={
                              archivedOrders.length > 0 &&
                              selectedArchiveIds.length === archivedOrders.length
                            }
                            className="w-4 h-4 rounded cursor-pointer"
                          />
                        </th>
                        <th className="pb-3">معرف الطلب</th>
                        <th className="pb-3">نوع الطلب / التفاصيل</th>
                        <th className="pb-3">الوقت</th>
                        <th className="pb-3">المبلغ</th>
                        <th className="pb-3">الحالة الحالية</th>
                        <th className="pb-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {archivedOrders.map((o) => (
                        <tr key={o.id} className="font-bold text-slate-700 hover:bg-slate-50">
                          <td className="py-3">
                            <input
                              type="checkbox"
                              checked={selectedArchiveIds.includes(o.id)}
                              onChange={() => handleSelectArchiveItem(o.id)}
                              className="w-4 h-4 rounded cursor-pointer"
                            />
                          </td>
                          <td className="py-3">#{o.id}</td>
                          <td className="py-3">
                            {o.orderType === 'delivery' ? (
                              <div>
                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                                  🛵 توصيل: {o.customerName || 'بدون اسم'}
                                </span>
                                <div className="text-xs text-slate-400 font-normal">{o.customerPhone}</div>
                              </div>
                            ) : (
                              <span>طاولة #{o.tableId}</span>
                            )}
                          </td>
                          <td className="py-3 text-xs text-slate-400">{o.createdAt}</td>
                          <td className="py-3 text-emerald-600">{o.total} درهم</td>
                          <td className="py-3">
                            <span className="bg-slate-100 text-slate-800 text-xs px-2.5 py-1 rounded-md">
                              {o.status === 'completed'
                                ? 'تم التسليم ✅'
                                : o.status === 'preparing'
                                ? 'جاري التحضير 🍳'
                                : 'معلق ⏳'}
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            <button
                              onClick={() => handlePrintOrder(o)}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer"
                            >
                              🖨️ طباعة
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default KitchenDashboard;