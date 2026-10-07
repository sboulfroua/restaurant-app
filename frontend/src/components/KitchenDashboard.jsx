import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';

const socket = io('https://ministries-robot-stores-felt.trycloudflare.com');

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

  const [activeTab, setActiveTab] = useState('orders');

  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(false);

  // بيانات الأرشيف والمبيعات مستلمة من السيرفر مباشرة
  const [archivedOrders, setArchivedOrders] = useState([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);

  const [newDish, setNewDish] = useState({ name: '', price: '', category: 'أطباق رئيسية', image: '' });
  const [customMenu, setCustomMenu] = useState([]);

  useEffect(() => {
    // استقبال القائمة من السيرفر
    socket.on('current_menu', (menu) => {
      setCustomMenu(menu);
    });

    // استقبال بيانات الأرشيف والمبيعات المحسوبة من السيرفر
    socket.on('archive_data', (data) => {
      setArchivedOrders(data.archive);
      setTodayTotal(data.todayTotal);
      setMonthTotal(data.monthTotal);
    });

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
      socket.off('current_menu');
      socket.off('archive_data');
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

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewDish((prev) => ({ ...prev, image: reader.result }));
      };
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
    alert('تم إضافة الطبق ونشره على هواتف الزبائن بنجاح!');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 dir-rtl" dir="rtl">
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
                placeholder="مثال: admin"
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
    <div className="min-h-screen bg-slate-100 flex dir-rtl" dir="rtl">
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

      <main className="flex-1 p-6 overflow-y-auto">
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

        {activeTab === 'orders' && (
          <div>
            {orders.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl shadow-sm border text-gray-400">
                لا توجد طلبات جديدة حالياً. بانتظار الطلبات من الهواتف...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className={`bg-white rounded-2xl shadow-md border-2 p-5 ${
                      order.status === 'pending'
                        ? 'border-amber-400'
                        : order.status === 'preparing'
                        ? 'border-blue-400'
                        : 'border-emerald-400'
                    }`}
                  >
                    <div className="flex justify-between items-center border-b pb-3 mb-3">
                      <span className="text-lg font-black text-slate-900">طاولة #{order.tableId}</span>
                      <span className="text-xs text-gray-500 font-bold">{order.createdAt}</span>
                    </div>

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

                    <div className="border-t pt-3 flex justify-between items-center mb-4">
                      <span className="font-bold text-slate-600">المجموع:</span>
                      <span className="font-black text-emerald-600">{order.total} درهم</span>
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
                ))}
              </div>
            )}
          </div>
        )}

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
              <h3 className="text-lg font-black text-slate-800 mb-4">سجل الطلبات الكامل الدائم</h3>
              {archivedOrders.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">لا يوجد طلبات أرشيفية بعد.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b text-slate-400 font-bold">
                        <th className="pb-3">معرف الطلب</th>
                        <th className="pb-3">الطاولة</th>
                        <th className="pb-3">الوقت</th>
                        <th className="pb-3">الملاحظة</th>
                        <th className="pb-3">المبلغ</th>
                        <th className="pb-3">الحالة الحالية</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {archivedOrders.map((o) => (
                        <tr key={o.id} className="font-bold text-slate-700">
                          <td className="py-3">#{o.id}</td>
                          <td className="py-3">طاولة #{o.tableId}</td>
                          <td className="py-3 text-xs text-slate-400">{o.createdAt}</td>
                          <td className="py-3 text-xs text-amber-700">{o.note || 'لا توجد'}</td>
                          <td className="py-3 text-emerald-600">{o.total} درهم</td>
                          <td className="py-3">
                            <span className="bg-slate-100 text-slate-800 text-xs px-2.5 py-1 rounded-md">
                              {o.status === 'completed' ? 'تم التسليم ✅' : o.status === 'preparing' ? 'جاري التحضير 🍳' : 'معلق ⏳'}
                            </span>
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