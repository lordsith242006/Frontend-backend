import React, { useEffect, useState } from 'react';
import { resolveAssetUrl, uploadApi } from '../api';
import { categoryOptions } from '../labels';

const initialState = {
  title: '',
  category: 'GPU',
  price: '',
  stock: '',
  rating: '',
  description: '',
  image: '',
  imageFile: null
};

export default function ProductForm({ initialProduct, onCancel, onSubmit, loading }) {
  const [form, setForm] = useState(initialState);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (initialProduct) {
      setForm({
        title: initialProduct.title ?? '',
        category: initialProduct.category ?? 'GPU',
        price: initialProduct.price ?? '',
        stock: initialProduct.stock ?? '',
        rating: initialProduct.rating ?? '',
        description: initialProduct.description ?? '',
        image: initialProduct.image ?? '',
        imageFile: null
      });
    } else {
      setForm(initialState);
    }

    setFormError('');
  }, [initialProduct]);

  useEffect(() => {
    if (form.imageFile) {
      const nextPreviewUrl = URL.createObjectURL(form.imageFile);
      setPreviewUrl(nextPreviewUrl);

      return () => {
        URL.revokeObjectURL(nextPreviewUrl);
      };
    }

    setPreviewUrl(resolveAssetUrl(form.image));
    return undefined;
  }, [form.image, form.imageFile]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormError('');
    setForm((current) => ({ ...current, [name]: value }));
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0] ?? null;
    setFormError('');
    setForm((current) => ({ ...current, imageFile: file }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const title = String(form.title).trim();
    const category = String(form.category).trim();
    const description = String(form.description).trim();
    const price = Number(form.price);
    const stock = Number(form.stock);
    const rating = form.rating === '' ? 0 : Number(form.rating);

    if (title.length < 3) {
      setFormError('Название должно содержать не меньше 3 символов.');
      return;
    }

    if (category.length < 2) {
      setFormError('Категория должна содержать не меньше 2 символов.');
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setFormError('Цена должна быть больше нуля.');
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      setFormError('Остаток должен быть целым числом от 0.');
      return;
    }

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      setFormError('Рейтинг должен быть от 0 до 5.');
      return;
    }

    if (description.length < 10) {
      setFormError('Описание должно содержать не меньше 10 символов.');
      return;
    }

    let image = form.image;

    if (form.imageFile) {
      setUploading(true);
      try {
        image = await uploadApi.image(form.imageFile);
      } catch (uploadError) {
        setFormError(uploadError.response?.data?.error || 'Не удалось загрузить изображение.');
        return;
      } finally {
        setUploading(false);
      }
    }

    onSubmit({
      ...form,
      title,
      category,
      description,
      price,
      stock,
      rating,
      image
    });
  }

  return (
    <form className="panel form-panel" onSubmit={handleSubmit}>
      <div className="form-panel__top">
        <div className="panel__header">
          <div>
            <span className="eyebrow">Редактор</span>
            <h3>{initialProduct ? 'Редактирование товара' : 'Новая карточка товара'}</h3>
            <p>{initialProduct ? 'Измените поля и сохраните обновлённую версию карточки.' : 'Заполните поля, чтобы добавить новую позицию в каталог.'}</p>
          </div>
          <span className="panel-tag">{initialProduct ? 'Edit' : 'New'}</span>
        </div>

        <div className="form-panel__actions">
          <button type="button" className="button-ghost" onClick={onCancel} disabled={loading || uploading}>
            Закрыть
          </button>
        </div>
      </div>

      <div className="form-grid">
        <label>
          <span>Название</span>
          <input name="title" value={form.title} onChange={handleChange} placeholder="RTX 4080 Super" required />
        </label>

        <label>
          <span>Категория</span>
          <select name="category" value={form.category} onChange={handleChange}>
            {categoryOptions
              .filter((option) => option.value !== 'all')
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </select>
        </label>

        <label>
          <span>Цена</span>
          <input name="price" type="number" min="1" value={form.price} onChange={handleChange} placeholder="59990" required />
        </label>

        <label>
          <span>Остаток</span>
          <input name="stock" type="number" min="0" value={form.stock} onChange={handleChange} placeholder="12" required />
        </label>

        <label>
          <span>Рейтинг</span>
          <input name="rating" type="number" min="0" max="5" step="0.1" value={form.rating} onChange={handleChange} />
        </label>

        <label className="form-grid__full">
          <span>Описание</span>
          <textarea
            name="description"
            rows="5"
            value={form.description}
            onChange={handleChange}
            placeholder="Краткое описание товара, его позиционирование и сильные стороны."
            required
          />
        </label>

        <label>
          <span>Ссылка на изображение</span>
          <input name="image" value={form.image} onChange={handleChange} placeholder="/images/rtx4090.png" />
        </label>

        <label className="upload-field">
          <span>Локальный файл</span>
          <input type="file" accept="image/*" onChange={handleFileChange} />
          <small>{form.imageFile ? `Выбран файл: ${form.imageFile.name}` : 'Необязательно. Загруженный файл заменит ссылку выше.'}</small>
        </label>

        {previewUrl ? (
          <div className="preview-card form-grid__full">
            <img src={previewUrl} alt="Предпросмотр товара" />
            <div className="preview-card__meta">
              <strong>Предпросмотр изображения</strong>
              <span>{form.imageFile ? 'Показан локальный файл' : 'Показано текущее изображение товара'}</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="form-submit-row">
        <div>
          <p className="panel__hint">Обязательные поля: название, категория, цена, остаток и описание.</p>
          {formError ? <div className="notice notice--error">{formError}</div> : null}
        </div>
        <button type="submit" disabled={loading || uploading}>
          {loading || uploading ? 'Сохранение...' : initialProduct ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </form>
  );
}
