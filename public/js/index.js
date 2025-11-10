const API = '/api';
let token = null;
let currentUser = null;
let mode = 'login'; // 'login' | 'register'
let currentBookId = null;

// DOM элементы
const userInfoEl = document.getElementById('user-info');
const bookListEl = document.getElementById('book-list');
const emptyEl = document.getElementById('empty');

// Auth modal
const authModal = document.getElementById('auth-modal');
const modalTitle = document.getElementById('modal-title');
const modalSub = document.getElementById('modal-sub');
const modalEmail = document.getElementById('modal-email');
const modalPass = document.getElementById('modal-pass');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');

// Book modal
const bookModal = document.getElementById('book-modal');
const bookModalTitle = document.getElementById('book-modal-title');
const bookModalAuthor = document.getElementById('book-modal-author');
const bookModalMeta = document.getElementById('book-modal-meta');
const bookModalDesc = document.getElementById('book-modal-desc');
const bookModalPrices = document.getElementById('book-modal-prices');
const bookModalCover = document.getElementById('book-modal-cover');
const bookModalBadge = document.getElementById('book-modal-badge');
const bookModalClose = document.getElementById('book-modal-close');
const btnModalBuy = document.getElementById('book-modal-buy');
const btnModalRent2w = document.getElementById('book-modal-rent-2w');
const btnModalRent1m = document.getElementById('book-modal-rent-1m');
const btnModalRent3m = document.getElementById('book-modal-rent-3m');

// ---------- UI helpers ----------

function setUserInfo() {
  if (currentUser) {
    userInfoEl.textContent =
      `${currentUser.name} · ${currentUser.role === 'admin' ? 'администратор' : 'пользователь'}`;
  } else {
    userInfoEl.textContent = 'Гость · только просмотр';
  }
}

function openAuthModal(newMode) {
  mode = newMode;
  modalEmail.value = '';
  modalPass.value = '';
  if (mode === 'login') {
    modalTitle.textContent = 'Войти';
    modalSub.textContent = 'Введите email и пароль для входа.';
    modalConfirm.textContent = 'Войти';
  } else {
    modalTitle.textContent = 'Создать аккаунт';
    modalSub.textContent = 'Создадим простой аккаунт по вашему email.';
    modalConfirm.textContent = 'Зарегистрироваться';
  }
  authModal.style.display = 'flex';
}

function closeAuthModal() {
  authModal.style.display = 'none';
}

function openBookModal(book) {
  currentBookId = book.id;

  bookModalTitle.textContent = book.title;
  bookModalAuthor.textContent = `Автор: ${book.author}`;
  bookModalMeta.textContent =
    `Категория: ${book.category} · ${book.year || 'год не указан'} · Статус: ${book.status}`;
  bookModalDesc.textContent =
    book.description || 'Описание для этой книги пока не добавлено.';

  const rentParts = [];
  if (book.price_rent_2w) rentParts.push(`2 недели — ${book.price_rent_2w} ₽`);
  if (book.price_rent_1m) rentParts.push(`1 месяц — ${book.price_rent_1m} ₽`);
  if (book.price_rent_3m) rentParts.push(`3 месяца — ${book.price_rent_3m} ₽`);

  bookModalPrices.innerHTML = `
    <div><b>Покупка:</b> ${book.price_buy ? book.price_buy + ' ₽' : 'недоступна'}</div>
    <div><b>Аренда:</b> ${rentParts.length ? rentParts.join(' · ') : 'недоступна'}</div>
  `;

  let badgeText = '';
  if (book.status === 'available') badgeText = 'Доступна к заказу';
  if (book.status === 'out_of_stock') badgeText = 'Временно нет в наличии';
  if (book.status === 'unavailable') badgeText = 'Недоступна';
  if (badgeText) {
    bookModalBadge.style.display = 'inline-flex';
    bookModalBadge.textContent = badgeText;
  } else {
    bookModalBadge.style.display = 'none';
  }

  if (book.cover_url) {
    bookModalCover.style.display = 'block';
    bookModalCover.style.backgroundImage = `url('${book.cover_url}')`;
  } else {
    bookModalCover.style.display = 'none';
  }

  btnModalBuy.disabled = !book.price_buy || book.status !== 'available';
  btnModalRent2w.disabled = !book.price_rent_2w || book.status !== 'available';
  btnModalRent1m.disabled = !book.price_rent_1m || book.status !== 'available';
  btnModalRent3m.disabled = !book.price_rent_3m || book.status !== 'available';

  bookModal.style.display = 'flex';
}

function closeBookModal() {
  bookModal.style.display = 'none';
  currentBookId = null;
}

// ---------- Auth ----------

async function handleAuth() {
  const email = modalEmail.value.trim();
  const password = modalPass.value.trim();
  if (!email || !password) {
    alert('Введите email и пароль');
    return;
  }

  if (mode === 'register') {
    const name = email.split('@')[0];
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || data.message || 'Ошибка регистрации');
      return;
    }
    alert('Регистрация успешна, теперь войдите.');
    openAuthModal('login');
    return;
  }

  if (mode === 'login') {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.message || 'Ошибка входа');
      return;
    }
    token = data.token;
    currentUser = { name: data.name, role: data.role };
    setUserInfo();
    closeAuthModal();
    alert('Вы успешно вошли.');
    loadBooks();
  }
}

// ---------- API действия ----------

async function loadBooks() {
  const category = document.getElementById('filter-category').value.trim();
  const author = document.getElementById('filter-author').value.trim();
  const year = document.getElementById('filter-year').value.trim();
  const sortBy = document.getElementById('sort-by').value;

  const params = new URLSearchParams();
  if (category) params.append('category', category);
  if (author) params.append('author', author);
  if (year) params.append('year', year);
  if (sortBy) params.append('sortBy', sortBy);

  const res = await fetch(`${API}/books?` + params.toString());
  const books = await res.json();

  bookListEl.innerHTML = '';
  if (!books.length) {
    emptyEl.style.display = 'block';
    emptyEl.textContent =
      'По заданным фильтрам ничего не найдено. Попробуйте изменить параметры поиска.';
    return;
  }
  emptyEl.style.display = 'none';

  books.forEach(b => {
    const div = document.createElement('div');
    div.className = 'book-card';

    let badgeText = '';
    if (b.status === 'available') badgeText = 'Доступна';
    if (b.status === 'out_of_stock') badgeText = 'Временно нет';
    if (b.status === 'unavailable') badgeText = 'Недоступна';

    const rentOptions = [];
    if (b.price_rent_2w) rentOptions.push(`2н: ${b.price_rent_2w} ₽`);
    if (b.price_rent_1m) rentOptions.push(`1м: ${b.price_rent_1m} ₽`);
    if (b.price_rent_3m) rentOptions.push(`3м: ${b.price_rent_3m} ₽`);

    div.innerHTML = `
      ${badgeText ? `<div class="book-badge">${badgeText}</div>` : ''}
      <h3 class="book-title">${b.title}</h3>
      <div class="book-author">Автор: ${b.author}</div>
      <div class="book-meta">Категория: ${b.category} · ${b.year || 'Год не указан'}</div>
      <div class="book-desc">${b.description || 'Описание скоро появится.'}</div>
      <div class="book-prices">
        <div><b>Покупка:</b> ${b.price_buy ? b.price_buy + ' ₽' : '—'}</div>
        <div><b>Аренда:</b> ${rentOptions.length ? rentOptions.join(' · ') : 'недоступна'}</div>
      </div>
      <div class="book-actions">
        <button class="btn-xs" data-action="view" data-id="${b.id}">Подробнее</button>
        <button class="btn-xs primary" data-action="buy" data-id="${b.id}">Купить</button>
        <button class="btn-xs" data-action="rent-2w" data-id="${b.id}">2 недели</button>
        <button class="btn-xs" data-action="rent-1m" data-id="${b.id}">1 месяц</button>
        <button class="btn-xs" data-action="rent-3m" data-id="${b.id}">3 месяца</button>
      </div>
    `;

    div.querySelectorAll('.btn-xs').forEach(btn => {
      const id = Number(btn.dataset.id);
      const action = btn.dataset.action;
      btn.addEventListener('click', async () => {
        if (action === 'view') {
          const r = await fetch(`${API}/books/${id}`);
          const book = await r.json();
          if (!r.ok) {
            alert(book.message || 'Ошибка загрузки книги');
            return;
          }
          openBookModal(book);
        }
        if (action === 'buy') return buyBook(id);
        if (action === 'rent-2w') return rentBook(id, '2w');
        if (action === 'rent-1m') return rentBook(id, '1m');
        if (action === 'rent-3m') return rentBook(id, '3m');
      });
    });

    bookListEl.appendChild(div);
  });
}

async function buyBook(bookId) {
  if (!token) {
    openAuthModal('login');
    return;
  }
  const res = await fetch(`${API}/buy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ bookId })
  });
  const data = await res.json();
  alert(data.message || JSON.stringify(data));
}

async function rentBook(bookId, period) {
  if (!token) {
    openAuthModal('login');
    return;
  }
  const res = await fetch(`${API}/rent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token
    },
    body: JSON.stringify({ bookId, period })
  });
  const data = await res.json();
  alert(data.message || JSON.stringify(data));
}

// ---------- События ----------

document.getElementById('apply-filters').onclick = loadBooks;
document.getElementById('btn-open-login').onclick = () => openAuthModal('login');
document.getElementById('btn-open-register').onclick = () => openAuthModal('register');

modalConfirm.onclick = handleAuth;
modalCancel.onclick = closeAuthModal;

authModal.addEventListener('click', e => {
  if (e.target === authModal) closeAuthModal();
});

bookModalClose.onclick = closeBookModal;
bookModal.addEventListener('click', e => {
  if (e.target === bookModal) closeBookModal();
});

// Кнопки в модалке книги
btnModalBuy.onclick = () => currentBookId && buyBook(currentBookId);
btnModalRent2w.onclick = () => currentBookId && rentBook(currentBookId, '2w');
btnModalRent1m.onclick = () => currentBookId && rentBook(currentBookId, '1m');
btnModalRent3m.onclick = () => currentBookId && rentBook(currentBookId, '3m');

// Старт
setUserInfo();
loadBooks();
