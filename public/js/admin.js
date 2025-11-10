const API = '/api';
let adminToken = null;

function setAdminInfo(text, ok) {
  const el = document.getElementById('admin-info');
  el.textContent = text || '';
  el.style.color = ok ? '#22c55e' : '#9ca3af';
}

async function adminLogin() {
  const email = document.getElementById('admin-email').value.trim();
  const password = document.getElementById('admin-pass').value.trim();
  if (!email || !password) {
    alert('Введите email и пароль администратора');
    return;
  }

  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();

  if (!res.ok) {
    alert(data.message || 'Ошибка входа');
    setAdminInfo('Ошибка входа', false);
    return;
  }
  if (data.role !== 'admin') {
    alert('Этот пользователь не является администратором');
    setAdminInfo('Нет прав администратора', false);
    return;
  }

  adminToken = data.token;
  setAdminInfo(`Вход выполнен: ${data.name} (admin)`, true);
  loadBooks();
}

function clearForm() {
  document.getElementById('book-id').value = '';
  document.getElementById('book-title').value = '';
  document.getElementById('book-author').value = '';
  document.getElementById('book-category').value = '';
  document.getElementById('book-year').value = '';
  document.getElementById('book-cover').value = '';
  document.getElementById('book-description').value = '';
  document.getElementById('book-price-buy').value = '';
  document.getElementById('book-price-2w').value = '';
  document.getElementById('book-price-1m').value = '';
  document.getElementById('book-price-3m').value = '';
  document.getElementById('book-status').value = 'available';
}

async function saveBook() {
  if (!adminToken) return alert('Сначала войдите как администратор');

  const id = document.getElementById('book-id').value.trim();
  const body = {
    title: document.getElementById('book-title').value.trim(),
    author: document.getElementById('book-author').value.trim(),
    category: document.getElementById('book-category').value.trim(),
    year: Number(document.getElementById('book-year').value) || null,
    description: document.getElementById('book-description').value.trim(),
    cover_url: document.getElementById('book-cover').value.trim(),
    price_buy: Number(document.getElementById('book-price-buy').value) || 0,
    price_rent_2w: Number(document.getElementById('book-price-2w').value) || null,
    price_rent_1m: Number(document.getElementById('book-price-1m').value) || null,
    price_rent_3m: Number(document.getElementById('book-price-3m').value) || null,
    status: document.getElementById('book-status').value
  };

  if (!body.title || !body.author || !body.category) {
    alert('Название, автор и категория обязательны');
    return;
  }

  const url = id ? `${API}/admin/books/${id}` : `${API}/admin/books`;
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + adminToken
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || data.message || 'Ошибка сохранения');
    return;
  }
  alert('Книга сохранена');
  clearForm();
  loadBooks();
}

async function loadBooks() {
  if (!adminToken) return;
  const res = await fetch(`${API}/admin/books`, {
    headers: { Authorization: 'Bearer ' + adminToken }
  });
  const books = await res.json();
  const tbody = document.querySelector('#books-table tbody');
  tbody.innerHTML = '';

  if (!Array.isArray(books)) {
    tbody.innerHTML = '<tr><td colspan="5">Ошибка загрузки данных</td></tr>';
    return;
  }

  if (!books.length) {
    tbody.innerHTML = '<tr><td colspan="5">Книг пока нет</td></tr>';
    return;
  }

  books.forEach(b => {
    const tr = document.createElement('tr');
    const statusClass = `status ${b.status}`;
    const safe = v =>
      (v || '')
        .toString()
        .replace(/'/g, "\\'")
        .replace(/\n/g, ' ');

    tr.innerHTML = `
      <td>${b.id}</td>
      <td>
        <div><b>${b.title}</b></div>
        <div>${b.author}</div>
      </td>
      <td>
        <div>${b.category}</div>
        <div>${b.year || ''}</div>
      </td>
      <td>
        <div>buy: ${b.price_buy || 0}</div>
        <div>2w: ${b.price_rent_2w || '-'}</div>
        <div>1m: ${b.price_rent_1m || '-'}</div>
        <div>3m: ${b.price_rent_3m || '-'}</div>
      </td>
      <td>
        <div class="${statusClass}">${b.status}</div>
        <div>
          <button class="btn-xs"
            onclick="prefill(${b.id},
              '${safe(b.title)}',
              '${safe(b.author)}',
              '${safe(b.category)}',
              '${safe(b.year || '')}',
              '${safe(b.description || '')}',
              '${safe(b.cover_url || '')}',
              '${b.price_buy || ''}',
              '${b.price_rent_2w || ''}',
              '${b.price_rent_1m || ''}',
              '${b.price_rent_3m || ''}',
              '${b.status}'
            )">✏️ Редактировать</button>
        </div>
        <div>
          <button class="btn-xs" onclick="changeStatus(${b.id}, 'available')">✔ available</button>
          <button class="btn-xs" onclick="changeStatus(${b.id}, 'out_of_stock')">⏳ out_of_stock</button>
          <button class="btn-xs" onclick="changeStatus(${b.id}, 'unavailable')">🚫 unavailable</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function changeStatus(id, status) {
  if (!adminToken) return alert('Авторизуйтесь как администратор');
  const res = await fetch(`${API}/admin/books/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + adminToken
    },
    body: JSON.stringify({ status })
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || data.message || 'Ошибка изменения статуса');
    return;
  }
  loadBooks();
}

function prefill(
  id,
  title,
  author,
  category,
  year,
  desc,
  cover,
  pb,
  p2,
  p1,
  p3,
  status
) {
  document.getElementById('book-id').value = id;
  document.getElementById('book-title').value = title;
  document.getElementById('book-author').value = author;
  document.getElementById('book-category').value = category;
  document.getElementById('book-year').value = year || '';
  document.getElementById('book-description').value = desc;
  document.getElementById('book-cover').value = cover;
  document.getElementById('book-price-buy').value = pb || '';
  document.getElementById('book-price-2w').value = p2 || '';
  document.getElementById('book-price-1m').value = p1 || '';
  document.getElementById('book-price-3m').value = p3 || '';
  document.getElementById('book-status').value = status || 'available';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// События
document.getElementById('btn-admin-login').onclick = adminLogin;
document.getElementById('btn-save-book').onclick = saveBook;
document.getElementById('btn-load-books').onclick = loadBooks;
document.getElementById('btn-clear-form').onclick = clearForm;

// Глобально для инлайновых обработчиков
window.prefill = prefill;
window.changeStatus = changeStatus;
