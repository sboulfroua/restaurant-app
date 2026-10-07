import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import io from 'socket.io-client';

const socket = io('https://restaurantapp-por20ab8.b4a.run');

// نغمة مميزة ومريحة للزبون عند تحديث حالة الطلب
const playCustomerNotificationSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const playChimeNote = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);

      gain.gain.setValueAtTime(0.15, audioCtx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(audioCtx.currentTime + startTime);
      osc.stop(audioCtx.currentTime + startTime + duration);
    };

    playChimeNote(1046.50, 0, 0.3);
    playChimeNote(1318.51, 0.15, 0.4);
  } catch (e) {
    console.log('Audio error:', e);
  }
};

function CustomerMenu() {
  const { tableId } = useParams();
  const currentTable = tableId || '1';
  
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [orderNote, setOrderNote] = useState('');

  // التصنيف النشط للتصفية
  const [activeCategory, setActiveCategory] = useState('أطباق رئيسية');
  const [menuItems, setMenuItems] = useState([]);

  useEffect(() => {
    socket.on('current_menu', (menu) => {
      setMenuItems(menu);
    });

    socket.on('order_status_updated', (updatedOrder) => {
      if (String(updatedOrder.tableId) === String(currentTable)) {
        setCurrentOrder(updatedOrder);
        playCustomerNotificationSound();
      }
    });

    socket.on('dish_added', (newDish) => {
      setMenuItems((prev) => {
        if (prev.some((item) => item.id === newDish.id)) return prev;
        if (prev.length >= 100) return prev;
        return [...prev, newDish];
      });
    });

    return () => {
      socket.off('current_menu');
      socket.off('order_status_updated');
      socket.off('dish_added');
    };
  }, [currentTable]);

  const addToCart = (item) => {
    setCart((prevCart) => {
      const existing = prevCart.find((i) => i.id === item.id);
      if (existing) {
        return prevCart.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prevCart, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  };

  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSendOrder = () => {
    if (cart.length === 0) return;

    const newOrder = {
      id: Date.now(),
      tableId: currentTable,
      items: cart,
      total: totalPrice,
      note: orderNote,
      status: 'pending',
      createdAt: new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' })
    };

    socket.emit('send_order', newOrder);
    setCurrentOrder(newOrder);
    setCart([]);
    setOrderNote('');
    setIsCartOpen(false);
  };

  const handleCallWaiter = () => {
    socket.emit('call_waiter', { tableId: currentTable, time: new Date().toLocaleTimeString() });
    alert(`تم إرسال تنبيه للنادل للطاولة رقم ${currentTable}`);
  };

  const filteredItems = menuItems.filter(item => item.category === activeCategory);
  const categories = ['أطباق رئيسية', 'مقبلات', 'مشروبات', 'حلويات'];

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-900 text-slate-100 pb-32 font-sans dir-rtl" dir="rtl">
      
      {/* 1. الشريط العلوي الثابت: يظهر فيه اسم المطعم، رقم الطاولة، وحالة الطلب الحالي */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 p-4 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-base font-black text-amber-400">قائمة الطعام</h1>
            <p className="text-[11px] text-slate-400 font-bold">طاولة رقم #{currentTable}</p>
          </div>
          <button
            onClick={handleCallWaiter}
            className="bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500 hover:text-slate-900 font-black text-xs py-2 px-3.5 rounded-2xl transition active:scale-95 cursor-pointer"
          >
            🔔 استدعاء النادل
          </button>
        </div>

        {/* عرض الطلب والحالة في الأعلى بشكل حي */}
        {currentOrder && (
          <div className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-2xl text-xs">
            <div className="flex justify-between items-center mb-1 text-slate-400 font-bold">
              <span>آخر طلب تم إرساله:</span>
              <span className="text-amber-400 font-black">#{currentOrder.id.toString().slice(-4)}</span>
            </div>
            {currentOrder.status === 'pending' && (
              <p className="text-amber-300 font-black flex items-center gap-1.5">
                <span className="animate-pulse">⏳</span> بانتظار استلام المطبخ للطلب...
              </p>
            )}
            {currentOrder.status === 'preparing' && (
              <p className="text-blue-400 font-black flex items-center gap-1.5">
                <span className="animate-spin">🍳</span> جاري تحضير الوجبة في المطبخ الآن!
              </p>
            )}
            {currentOrder.status === 'completed' && (
              <p className="text-emerald-400 font-black flex items-center gap-1.5">
                <span>🎉</span> طعامك جاهز للتقديم وسيصلك فوراً!
              </p>
            )}
          </div>
        )}
      </header>

      {/* 2. المحتوى الوسطي: عرض الأطباق التابعة للفئة المحددة */}
      <main className="p-4 space-y-3">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm font-black text-slate-300">{activeCategory}</h2>
          <span className="text-xs text-slate-500 font-bold">{filteredItems.length} عنصر</span>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-24 bg-slate-800/40 rounded-3xl border border-slate-800 text-slate-500 font-bold text-xs">
            🍽️ لا توجد أطباق متوفرة في هذا القسم حالياً...
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id} className="bg-slate-800/60 border border-slate-700/50 p-3.5 rounded-3xl flex items-center justify-between gap-3 shadow-sm">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-20 h-20 rounded-2xl object-cover shrink-0 border border-slate-700" />
              ) : (
                <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-500 font-bold text-[10px] shrink-0 border border-slate-700">
                  بدون صورة
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-slate-100 truncate">{item.name}</h3>
                <p className="text-xs font-black text-emerald-400 mt-1.5">{item.price} درهم</p>
              </div>

              <button
                onClick={() => addToCart(item)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs py-2.5 px-4 rounded-2xl transition active:scale-95 cursor-pointer shrink-0 shadow-md"
              >
                + إضافة
              </button>
            </div>
          ))
        )}
      </main>

      {/* زر السلة العائم (يظهر عند اختيار أطباق) */}
      {cart.length > 0 && !isCartOpen && (
        <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white p-4 rounded-3xl shadow-2xl flex justify-between items-center border border-emerald-500 active:scale-98 transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <span className="bg-white text-emerald-900 text-xs font-black w-6 h-6 rounded-full flex items-center justify-center shadow-inner">
                {totalItemsCount}
              </span>
              <span className="font-black text-xs">عرض سلة الطلبات</span>
            </div>
            <span className="font-black text-white text-sm">{totalPrice} درهم ←</span>
          </button>
        </div>
      )}

      {/* 3. الشريط السفلي الثابت (Bottom Navigation Bar): الفئات والتصنيفات */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 p-3 z-30 flex justify-around items-center shadow-2xl">
        {categories.map((cat, idx) => (
          <button
            key={idx}
            onClick={() => setActiveCategory(cat)}
            className={`flex-1 py-2.5 mx-1 rounded-2xl text-[11px] font-black transition cursor-pointer text-center ${
              activeCategory === cat
                ? 'bg-amber-500 text-slate-950 shadow-lg'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </nav>

      {/* نافذة تفاصيل السلة وإرسال الطلب */}
      {isCartOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-end justify-center p-0">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-t-[35px] p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto text-slate-100">
            
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-100">تفاصيل سلة الطلبات</h3>
              <button
                onClick={() => setIsCartOpen(false)}
                className="text-slate-400 font-bold text-xs bg-slate-800 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer hover:bg-slate-700 transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 divide-y divide-slate-800">
              {cart.map((item) => (
                <div key={item.id} className="pt-3 first:pt-0 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-black text-slate-200 block mb-0.5">{item.name}</span>
                    <span className="text-[10px] text-slate-400 font-bold">الكمية: {item.quantity}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-amber-400">{item.price * item.quantity} درهم</span>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-red-400 font-bold text-[10px] bg-red-950/50 border border-red-900/50 px-2.5 py-1 rounded-xl hover:bg-red-900/50 transition cursor-pointer"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <label className="block text-xs font-black text-slate-300 mb-1.5">
                💬 ملاحظة خاصة للمطبخ (اختياري):
              </label>
              <textarea
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="مثال: بدون بصل، الطاولة باردة..."
                className="w-full p-3 rounded-2xl border border-slate-700 bg-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs font-bold"
                rows="2"
              ></textarea>
            </div>

            <div className="flex justify-between items-center border-t border-slate-800 pt-3 font-black text-base">
              <span className="text-slate-400">الإجمالي الكلي:</span>
              <span className="text-amber-400">{totalPrice} درهم</span>
            </div>

            <button
              onClick={handleSendOrder}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black py-4 rounded-2xl shadow-xl transition cursor-pointer flex items-center justify-center gap-2"
            >
              تأكيد وإرسال الطلب للمطبخ 🚀
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerMenu;