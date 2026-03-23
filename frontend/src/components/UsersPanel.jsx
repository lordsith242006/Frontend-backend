import React, { useMemo } from 'react';
import { getRoleLabel } from '../labels';

function getRoleTone(role) {
  if (role === 'admin') return 'danger';
  if (role === 'moderator') return 'warning';
  return 'success';
}

export default function UsersPanel({ users, loading, currentUserId, onReload, onToggleBlock }) {
  const stats = useMemo(() => {
    return users.reduce(
      (accumulator, user) => {
        accumulator.total += 1;
        accumulator.sessions += user.activeSessions;
        accumulator.products += user.productsCreated;
        accumulator.blocked += user.isBlocked ? 1 : 0;
        accumulator[user.role] += 1;
        return accumulator;
      },
      {
        total: 0,
        sessions: 0,
        products: 0,
        blocked: 0,
        admin: 0,
        moderator: 0,
        user: 0
      }
    );
  }, [users]);

  return (
    <section className="panel users-panel panel--paper">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Команда</span>
          <h3>Пользователи системы</h3>
          <p>Роли, активные сессии, количество товаров и статус блокировки.</p>
        </div>
        <button type="button" className="button-secondary" onClick={onReload} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
      </div>

      <div className="users-panel__stats">
        <div>
          <strong>{stats.total}</strong>
          <span>всего аккаунтов</span>
        </div>
        <div>
          <strong>{stats.admin + stats.moderator}</strong>
          <span>с расширенными правами</span>
        </div>
        <div>
          <strong>{stats.sessions}</strong>
          <span>активных сессий</span>
        </div>
        <div>
          <strong>{stats.blocked}</strong>
          <span>заблокировано</span>
        </div>
      </div>

      {users.length === 0 && !loading ? <div className="empty-state empty-state--compact">Пользователи не найдены.</div> : null}

      <div className="users-grid">
        {users.map((user) => {
          const isCurrentUser = user.id === currentUserId;
          const canToggleBlock = user.role !== 'admin' && !isCurrentUser;

          return (
            <article key={user.id} className="user-card">
              <div className="user-card__top">
                <div>
                  <h4>{user.username}</h4>
                  <p>{user.id}</p>
                </div>
                <span className={`badge badge--${getRoleTone(user.role)}`}>{getRoleLabel(user.role)}</span>
              </div>

              <dl className="user-card__meta">
                <div>
                  <dt>Создан</dt>
                  <dd>{new Date(user.createdAt).toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Товаров</dt>
                  <dd>{user.productsCreated}</dd>
                </div>
                <div>
                  <dt>Сессий</dt>
                  <dd>{user.activeSessions}</dd>
                </div>
                <div>
                  <dt>Статус</dt>
                  <dd>{user.isBlocked ? 'Заблокирован' : 'Активен'}</dd>
                </div>
              </dl>

              {canToggleBlock ? (
                <button
                  type="button"
                  className={user.isBlocked ? 'button-secondary' : 'button-danger'}
                  onClick={() => onToggleBlock(user)}
                  disabled={loading}
                >
                  {user.isBlocked ? 'Разблокировать' : 'Заблокировать'}
                </button>
              ) : (
                <p className="panel__hint">{isCurrentUser ? 'Текущий администратор' : 'Недоступно для изменения'}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
