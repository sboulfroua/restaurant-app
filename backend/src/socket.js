export default function initSocket(io) {
  // مصفوفة الأطباق ومصفوفة الأرشيف مخزنة في السيرفر بصفة دائمة
  let serverMenu = [];
  let serverArchive = [];

  // دالة لحساب مبيعات اليوم والشهر بدقة
  const calculateSalesData = () => {
    const now = new Date();
    const todayStr = now.toDateString(); // تاريخ اليوم
    const currentMonth = now.getMonth(); // رقم الشهر الحالي
    const currentYear = now.getFullYear(); // السنة الحالية

    let todayTotal = 0;
    let monthTotal = 0;

    serverArchive.forEach((order) => {
      const orderDate = new Date(order.timestamp || Date.now());

      // حساب مبيعات اليوم
      if (orderDate.toDateString() === todayStr) {
        todayTotal += (order.total || 0);
      }

      // حساب مبيعات الشهر الحالي
      if (orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear) {
        monthTotal += (order.total || 0);
      }
    });

    return {
      archive: serverArchive,
      todayTotal,
      monthTotal,
    };
  };

  io.on('connection', (socket) => {
    // إرسال القائمة الحالية وبيانات الأرشيف والمبيعات فور اتصال أي جهاز
    socket.emit('current_menu', serverMenu);
    socket.emit('archive_data', calculateSalesData());

    // استقبال الطلب من الهاتف وتمريره للمطبخ وحفظه في الأرشيف الدائم
    socket.on('send_order', (orderData) => {
      const orderWithTime = { ...orderData, timestamp: Date.now() };
      serverArchive.unshift(orderWithTime); // حفظ الطلب في أرشيف السيرفر
      
      io.emit('receive_order', orderWithTime);
      io.emit('archive_data', calculateSalesData()); // تحديث الأرشيف والمبيعات للجميع
    });

    // استقبال استدعاء النادل
    socket.on('call_waiter', (data) => {
      io.emit('waiter_called', data);
    });

    // تحديث حالة الطلب وحفظ التحديث في الأرشيف
    socket.on('update_status', (updatedOrder) => {
      serverArchive = serverArchive.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
      io.emit('order_status_updated', updatedOrder);
      io.emit('archive_data', calculateSalesData()); // تحديث المبيعات والأرشيف
    });

    // إضافة طبق جديد وتخزينه في السيرفر (بحد أقصى 100 طبق)
    socket.on('add_new_dish', (newDish) => {
      if (serverMenu.length < 100) {
        serverMenu.push(newDish);
        io.emit('dish_added', newDish);
      }
    });

    socket.on('disconnect', () => {
      console.log('انقطع الاتصال بالجهاز:', socket.id);
    });
  });
}