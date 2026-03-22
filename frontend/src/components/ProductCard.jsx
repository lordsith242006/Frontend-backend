import React from 'react';
import { resolveAssetUrl } from '../api';
import { getCategoryLabel } from '../labels';

function getStockTone(stock) {
  if (stock <= 0) return 'danger';
  if (stock < 5) return 'warning';
  return 'success';
}

export default function ProductCard({ product, canEdit, canDelete, onOpen, onEdit, onDelete }) {
  return (
    <article className="product-card">
      <div className="product-card__image-wrap">
        <img className="product-card__image" src={resolveAssetUrl(product.image)} alt={product.title} />
        <div className="product-card__price-tag">{product.price.toLocaleString()} RUB</div>
      </div>

      <div className="product-card__body">
        <div className="product-card__meta">
          <span className="badge badge--dark">{getCategoryLabel(product.category)}</span>
          <span className={`badge badge--${getStockTone(product.stock)}`}>Остаток: {product.stock}</span>
        </div>

        <h3>{product.title}</h3>
        <p>{product.description}</p>

        <div className="product-card__stats">
          <div className="metric">
            <span>Категория</span>
            <strong>{getCategoryLabel(product.category)}</strong>
          </div>
          <div className="metric metric--inline">
            <span>Рейтинг</span>
            <strong>{product.rating ?? 0}/5</strong>
          </div>
        </div>
      </div>

      <div className="product-card__actions">
        <button type="button" onClick={() => onOpen(product.id)}>
          Подробнее
        </button>
        {canEdit ? (
          <button type="button" className="button-secondary" onClick={() => onEdit(product)}>
            Править
          </button>
        ) : null}
        {canDelete ? (
          <button type="button" className="button-danger" onClick={() => onDelete(product.id)}>
            Удалить
          </button>
        ) : null}
      </div>
    </article>
  );
}
