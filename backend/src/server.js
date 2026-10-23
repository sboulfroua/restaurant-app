import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8, // 100 Megabytes
  pingInterval: 10000,    // إرسال نبضة كل 10 ثوانٍ لضمان استقرار الاتصال
  pingTimeout: 20000
});

const DATABASE_URL = process.env.DATABASE_URL || process.env.MONGO_URI;

if (DATABASE_URL) {
  mongoose
    .connect(DATABASE_URL)
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));
} else {
  console.warn('⚠️ No DATABASE_URL found. Running with in-memory storage fallback.');
}

const dishSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: String,
  price: Number,
  category: String,
  image: String,
});

const orderSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  orderType: { type: String, default: 'dine_in' },
  tableId: String,
  customerName: String,
  customerPhone: String,
  customerAddress: String,
  items: Array,
  subtotal: Number,
  deliveryFee: Number,
  total: Number,
  note: String,
  status: { type: String, default: 'pending' },
  createdAt: String,
});

const Dish = mongoose.models.Dish || mongoose.model('Dish', dishSchema);
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

let memoryMenu = [];
let memoryOrders = [];
let categoriesList = ['أطباق رئيسية', 'مقبلات', 'مشروبات', 'حلويات'];

const calculateSalesStats = (ordersList) => {
  const todayTotal = ordersList.reduce((acc, order) => acc + Number(order.total || 0), 0);
  const monthTotal = todayTotal;
  return { todayTotal, monthTotal };
};

const broadcastArchiveData = async () => {
  try {
    let allOrders = [];
    if (mongoose.connection.readyState === 1) {
      allOrders = await Order.find().sort({ id: -1 });
    } else {
      allOrders = memoryOrders;
    }
    const { todayTotal, monthTotal } = calculateSalesStats(allOrders);
    io.emit('archive_data', { archive: allOrders, todayTotal, monthTotal });
  } catch (err) {
    console.error('Error broadcasting archive data:', err);
  }
};

app.get('/', (req, res) => {
  res.send('Server is active 🚀');
});

io.on('connection', async (socket) => {
  console.log('⚡ Client connected:', socket.id);

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

  socket.emit('current_categories', categoriesList);
  broadcastArchiveData();

  // إضافة طبق جديد
  socket.on('add_new_dish', async (newDish) => {
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

  // حذف طبق من المنيو
  socket.on('delete_dish', async (dishId) => {
    try {
      if (mongoose.connection.readyState === 1) {
        await Dish.deleteOne({ id: dishId });
        const updatedMenu = await Dish.find();
        io.emit('current_menu', updatedMenu);
      } else {
        memoryMenu = memoryMenu.filter((d) => d.id !== dishId);
        io.emit('current_menu', memoryMenu);
      }
    } catch (err) {
      console.error('Error deleting dish:', err);
    }
  });

  // إضافة تصنيف جديد
  socket.on('add_category', (categoryName) => {
    if (categoryName && !categoriesList.includes(categoryName)) {
      categoriesList.push(categoryName);
      io.emit('current_categories', categoriesList);
    }
  });

  // حذف تصنيف
  socket.on('delete_category', (categoryName) => {
    categoriesList = categoriesList.filter((cat) => cat !== categoryName);
    io.emit('current_categories', categoriesList);
  });

  // استقبال طلب جديد
  socket.on('send_order', async (newOrder) => {
    try {
      if (!newOrder.id) newOrder.id = Date.now();
      if (mongoose.connection.readyState === 1) {
        await Order.create(newOrder);
      } else {
        memoryOrders.unshift(newOrder);
      }
      io.emit('receive_order', newOrder);
      broadcastArchiveData();
    } catch (err) {
      console.error('Error saving order:', err);
    }
  });

  // تحديث حالة الطلب
  socket.on('update_status', async (updatedOrder) => {
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

  // استدعاء النادل
  socket.on('call_waiter', (data) => {
    io.emit('waiter_called', data);
  });

  // حذف طلبات محددة من الأرشيف
  socket.on('delete_archived_orders', async (idsToDelete) => {
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

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});

export default httpServer;