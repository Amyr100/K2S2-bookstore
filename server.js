const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
const PORT = 3000;
const SECRET = 'super_secret_key_change_me';

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------- БАЗА ДАННЫХ ----------------------
const db = new sqlite3.Database('./bookstore.db');

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(200) NOT NULL,
        author VARCHAR(150) NOT NULL,
        category VARCHAR(100) NOT NULL,
        year INT,
        description TEXT,
        cover_url VARCHAR(255),
        price_buy DECIMAL(10,2) NOT NULL,
        price_rent_2w DECIMAL(10,2),
        price_rent_1m DECIMAL(10,2),
        price_rent_3m DECIMAL(10,2),
        status VARCHAR(20) NOT NULL DEFAULT 'available'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS rentals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        book_id INTEGER NOT NULL,
        type VARCHAR(10) NOT NULL,
        period VARCHAR(10),
        start_date DATETIME NOT NULL,
        end_date DATETIME,
        price DECIMAL(10,2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS rent_reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rental_id INTEGER NOT NULL,
        remind_date DATETIME NOT NULL,
        sent BOOLEAN NOT NULL DEFAULT 0
      )
    `);

    // Админ по умолчанию
    db.get(`SELECT * FROM users WHERE email = ?`, ['admin@admin.com'], (err, row) => {
      if (!row) {
        const hash = bcrypt.hashSync('admin123', 8);
        db.run(
          'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
          ['Admin', 'admin@admin.com', hash, 'admin']
        );
        console.log('Создан админ: admin@admin.com / admin123');
      }
    });

    // Пара любимых книг по умолчанию
    db.get('SELECT COUNT(*) as cnt FROM books', (err, row) => {
      if (row && row.cnt === 0) {
        const stmt = db.prepare(`
          INSERT INTO books
          (title, author, category, year, description, cover_url,
           price_buy, price_rent_2w, price_rent_1m, price_rent_3m, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          'Три товарища',
          'Эрих Мария Ремарк',
          'Роман',
          1937,
          'История дружбы, любви и надежды в послевоенной Германии.',
          '',
          500, 150, 200, 300, 'available'
        );

        stmt.run(
          'Мастер и Маргарита',
          'Михаил Булгаков',
          'Роман',
          1967,
          'Мистика, сатира и любовь на фоне Москвы 30-х.',
          '',
          600, 180, 250, 350, 'available'
        );

        stmt.run(
          '1984',
          'Джордж Оруэлл',
          'Антиутопия',
          1949,
          'Классика антиутопии о тоталитарном обществе.',
          '',
          450, 130, 180, 260, 'available'
        );

        stmt.finalize();
        console.log('Добавлены тестовые книги.');
      }
    });
  });
}

initDb();

// ---------------------- АВТОРИЗАЦИЯ ----------------------

function auth(requiredRole) {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ message: 'Нет токена' });
    const token = header.split(' ')[1];
    try {
      const user = jwt.verify(token, SECRET);
      if (requiredRole && user.role !== requiredRole) {
        return res.status(403).json({ message: 'Доступ запрещен' });
      }
      req.user = user;
      next();
    } catch (e) {
      return res.status(401).json({ message: 'Неверный токен' });
    }
  };
}

// Регистрация пользователя
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Заполните все поля' });

  const hash = bcrypt.hashSync(password, 8);

  db.run(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
    [name, email, hash, 'user'],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Логин (user/admin)
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err || !user) return res.status(400).json({ message: 'Пользователь не найден' });
    const ok = bcrypt.compareSync(password, user.password);
    if (!ok) return res.status(400).json({ message: 'Неверный пароль' });
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email, name: user.name },
      SECRET,
      { expiresIn: '1d' }
    );
    res.json({ token, role: user.role, name: user.name });
  });
});

// ---------------------- ПОЛЬЗОВАТЕЛЬСКОЕ API ----------------------

// Список книг с фильтрами и сортировкой
app.get('/api/books', (req, res) => {
  const { category, author, year, sortBy } = req.query;

  const conditions = [];
  const params = [];

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (author) {
    conditions.push('author = ?');
    params.push(author);
  }
  if (year) {
    conditions.push('year = ?');
    params.push(year);
  }

  let query = 'SELECT * FROM books';
  if (conditions.length) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  if (sortBy === 'category') query += ' ORDER BY category, title';
  if (sortBy === 'author') query += ' ORDER BY author, title';
  if (sortBy === 'year') query += ' ORDER BY year DESC, title';

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Просмотр одной книги
app.get('/api/books/:id', (req, res) => {
  db.get('SELECT * FROM books WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ message: 'Книга не найдена' });
    res.json(row);
  });
});

// Вспомогательная функция
function calcEndDate(period) {
  const now = new Date();
  if (period === '2w') now.setDate(now.getDate() + 14);
  if (period === '1m') now.setMonth(now.getMonth() + 1);
  if (period === '3m') now.setMonth(now.getMonth() + 3);
  return now.toISOString();
}

// Покупка книги
app.post('/api/buy', auth(), (req, res) => {
  const { bookId } = req.body;
  db.get(
    'SELECT price_buy FROM books WHERE id = ? AND status = "available"',
    [bookId],
    (err, book) => {
      if (err || !book) {
        return res.status(400).json({ message: 'Книга недоступна для покупки' });
      }

      const price = book.price_buy;
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO rentals (user_id, book_id, type, start_date, price, status)
         VALUES (?, ?, 'buy', ?, ?, 'completed')`,
        [req.user.id, bookId, now, price],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ id: this.lastID, message: 'Покупка оформлена успешно' });
        }
      );
    }
  );
});

// Аренда книги
app.post('/api/rent', auth(), (req, res) => {
  const { bookId, period } = req.body;
  const priceColumn =
    period === '2w'
      ? 'price_rent_2w'
      : period === '1m'
      ? 'price_rent_1m'
      : period === '3m'
      ? 'price_rent_3m'
      : null;

  if (!priceColumn) {
    return res.status(400).json({ message: 'Неверный период аренды' });
  }

  db.get(
    `SELECT ${priceColumn} as price FROM books WHERE id = ? AND status = "available"`,
    [bookId],
    (err, book) => {
      if (err || !book || !book.price) {
        return res.status(400).json({ message: 'Аренда недоступна для этой книги/периода' });
      }

      const now = new Date().toISOString();
      const end = calcEndDate(period);

      db.run(
        `INSERT INTO rentals (user_id, book_id, type, period, start_date, end_date, price, status)
         VALUES (?, ?, 'rent', ?, ?, ?, ?, 'active')`,
        [req.user.id, bookId, period, now, end, book.price],
        function (err2) {
          if (err2) return res.status(500).json({ error: err2.message });

          const remindDate = new Date(end);
          remindDate.setDate(remindDate.getDate() - 3);

          db.run(
            'INSERT INTO rent_reminders (rental_id, remind_date) VALUES (?, ?)',
            [this.lastID, remindDate.toISOString()]
          );

          res.json({ id: this.lastID, message: 'Аренда оформлена успешно' });
        }
      );
    }
  );
});

// История покупок и аренд текущего пользователя
app.get('/api/my/rentals', auth(), (req, res) => {
  db.all(
    `SELECT r.*,
            b.title,
            b.author,
            b.cover_url
     FROM rentals r
     JOIN books b ON r.book_id = b.id
     WHERE r.user_id = ?
     ORDER BY r.start_date DESC`,
    [req.user.id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});


// ---------------------- АДМИН API ----------------------

// Все книги
app.get('/api/admin/books', auth('admin'), (req, res) => {
  db.all('SELECT * FROM books', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Создать книгу
app.post('/api/admin/books', auth('admin'), (req, res) => {
  const {
    title,
    author,
    category,
    year,
    description,
    cover_url,
    price_buy,
    price_rent_2w,
    price_rent_1m,
    price_rent_3m,
    status
  } = req.body;

  db.run(
    `INSERT INTO books
    (title, author, category, year, description, cover_url,
     price_buy, price_rent_2w, price_rent_1m, price_rent_3m, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      author,
      category,
      year || null,
      description || '',
      cover_url || '',
      price_buy || 0,
      price_rent_2w || null,
      price_rent_1m || null,
      price_rent_3m || null,
      status || 'available'
    ],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// Обновить книгу
app.put('/api/admin/books/:id', auth('admin'), (req, res) => {
  const {
    title,
    author,
    category,
    year,
    description,
    cover_url,
    price_buy,
    price_rent_2w,
    price_rent_1m,
    price_rent_3m,
    status
  } = req.body;

  db.run(
    `UPDATE books SET
     title=?, author=?, category=?, year=?, description=?, cover_url=?,
     price_buy=?, price_rent_2w=?, price_rent_1m=?, price_rent_3m=?, status=?
     WHERE id=?`,
    [
      title,
      author,
      category,
      year || null,
      description || '',
      cover_url || '',
      price_buy || 0,
      price_rent_2w || null,
      price_rent_1m || null,
      price_rent_3m || null,
      status || 'available',
      req.params.id
    ],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// Смена статуса
app.patch('/api/admin/books/:id/status', auth('admin'), (req, res) => {
  const { status } = req.body;
  db.run(
    'UPDATE books SET status = ? WHERE id = ?',
    [status, req.params.id],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

// Все аренды (для контроля)
app.get('/api/admin/rentals', auth('admin'), (req, res) => {
  db.all(
    `SELECT r.*, b.title, u.email
     FROM rentals r
     JOIN books b ON r.book_id = b.id
     JOIN users u ON r.user_id = u.id`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// ---------------------- НАПОМИНАНИЯ ----------------------

// Ежечасно проверяем, кому слать напоминания (здесь просто лог в консоль)
cron.schedule('0 * * * *', () => {
  const now = new Date().toISOString();
  db.all(
    `SELECT rr.id as reminder_id, r.id as rental_id, r.end_date, u.email, b.title
     FROM rent_reminders rr
     JOIN rentals r ON rr.rental_id = r.id
     JOIN users u ON r.user_id = u.id
     JOIN books b ON r.book_id = b.id
     WHERE rr.sent = 0 AND rr.remind_date <= ?`,
    [now],
    (err, rows) => {
      if (err || !rows || !rows.length) return;
      rows.forEach(row => {
        console.log(
          `[REMINDER] На ${row.email}: аренда "${row.title}" заканчивается ${row.end_date}`
        );
        db.run('UPDATE rent_reminders SET sent = 1 WHERE id = ?', [row.reminder_id]);
      });
    }
  );
});

// ---------------------- ЗАПУСК ----------------------
app.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});
