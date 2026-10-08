import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();

// 1. زيادة سعة استقبال البيانات للتحمل حتى 50 ميجابايت للصور
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const httpServer = createServer(app);

// 2. إعداد Socket.io مع السماح بحجم بيانات يصل إلى 100MB
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // 100 Megabytes
});

// 3. الاتصال بقاعدة بيانات MongoDB Atlas
const DATABASE_URL = process.env.DATABASE_URL || process.env.MONGO_URI;

if (DATABASE_URL) {
  mongoose
    .connect(DATABASE_URL)
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));
} else {
  console.warn('⚠️ No DATABASE_URL found. Running with in-memory storage fallback.');
}

// 4. تعريف Mongoose Schemas للأطباق والطلبات
const dishSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  price: Number,
  category: String,
  image: String,
});

const orderSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  orderType: { type: String, default: 'dine_in' }, // dine_in | delivery
  tableId: String,
  customerName: String,
  customerPhone: String,
  customerAddress: String,
  items: Array,
  subtotal: Number,
  deliveryFee: Number,
  total: Number,
  note: String,
  status: { type: String, default: 'pending' }, // pending | preparing | completed
  createdAt: String,
});

const Dish = mongoose.models.Dish || mongoose.model('Dish', dishSchema);
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ذاكرة مؤقتة للاستجابة السريعة في حال عدم توفر القاعدة
let memoryMenu = [];
let memoryOrders = [];

// دالة حساب مبيعات اليوم والشهر
const calculateSalesStats = (ordersList) => {
  const todayTotal = ordersList.reduce((acc, order) => acc + Number(order.total || 0), 0);
  const monthTotal = todayTotal;

  return { todayTotal, monthTotal };
};

// دالة جلب وإرسال بيانات الأرشيف للمطبخ
const broadcastArchiveData = async () => {
  try {
    let allOrders = [];
    if (mongoose.connection.readyState === 1) {
      allOrders = await Order.find().sort({ id: -1 });
    } else {
      allOrders = memoryOrders;
    }

    const { todayTotal, monthTotal } = calculateSalesStats(allOrders);

    io.emit('archive_data', {
      archive: allOrders,
      todayTotal,
      monthTotal,
    });
  } catch (err) {
    console.error('Error broadcasting archive data:', err);
  }
};

// 5. أحداث Socket.io المباشرة
io.on('connection', async (socket) => {
  console.log('⚡ Client connected:', socket.id);

  // إرسال المنيو الحالي فور اتصال أي عميل أو مطبخ
  try {
    if (mongoose.connection.readyState === 1) {
      const dishesFromDb = await Dish.find();
      socket.emit('current_menu', dishesFromDb);
    } else {
      socket.emit('current_menu', memoryMenu);
    }
  } catch (e) {
    socket.emit('current_menu', memoryMenu);
  }

  // إرسال بيانات الأرشيف للمطبخ
  broadcastArchiveData();

  // أ) إضافة طبق جديد للمنيو
  socket.on('add_new_dish', async (newDish) => {
    console.log('➕ Adding new dish:', newDish.name);
    try {
      if (!newDish.id) newDish.id = Date.now();
      newDish.price = Number(newDish.price);

      if (mongoose.connection.readyState === 1) {
        await Dish.create(newDish);
        const updatedMenu = await Dish.find();
        io.emit('current_menu', updatedMenu);
      } else {
        memoryMenu.push(newDish);
        io.emit('current_menu', memoryMenu);
      }
      io.emit('dish_added', newDish);
    } catch (err) {
      console.error('Error adding dish:', err);
    }
  });

  // ب) استقبال طلب جديد من الزبون
  socket.on('send_order', async (newOrder) => {
    console.log('📦 New order received:', newOrder.id);
    try {
      if (!newOrder.id) newOrder.id = Date.now();

      if (mongoose.connection.readyState === 1) {
        await Order.create(newOrder);
      } else {
        memoryOrders.unshift(newOrder);
      }

      // بث الطلب فوراً للمطبخ
      io.emit('receive_order', newOrder);
      // تحديث الأرشيف والإحصائيات
      broadcastArchiveData();
    } catch (err) {
      console.error('Error saving order:', err);
    }
  });

  // ج) تحديث حالة الطلب من المطبخ
  socket.on('update_status', async (updatedOrder) => {
    console.log('🔄 Updating status for order:', updatedOrder.id, '->', updatedOrder.status);
    try {
      if (mongoose.connection.readyState === 1) {
        await Order.findOneAndUpdate({ id: updatedOrder.id }, { status: updatedOrder.status });
      } else {
        memoryOrders = memoryOrders.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
      }

      io.emit('order_status_updated', updatedOrder);
      broadcastArchiveData();
    } catch (err) {
      console.error('Error updating order status:', err);
    }
  });

  // د) استدعاء النادل
  socket.on('call_waiter', (data) => {
    console.log('🔔 Waiter called for table:', data.tableId);
    io.emit('waiter_called', data);
  });

  // هـ) حذف طلبات محددة من الأرشيف
  socket.on('delete_archived_orders', async (idsToDelete) => {
    console.log('🗑️ Deleting archived orders:', idsToDelete);
    try {
      if (mongoose.connection.readyState === 1) {
        await Order.deleteMany({ id: { $in: idsToDelete } });
      } else {
        memoryOrders = memoryOrders.filter((o) => !idsToDelete.includes(o.id));
      }
      broadcastArchiveData();
    } catch (err) {
      console.error('Error deleting archived orders:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// 6. تشغيل السيرفر على المنفذ المخصص للبيئة السحابية
const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

export default httpServer;