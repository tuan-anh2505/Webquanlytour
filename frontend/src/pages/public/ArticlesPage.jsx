import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../../hooks/useResource';
import { usePageMeta } from '../../hooks/usePageMeta';
import { EmptyState, Pagination, RequestState } from '../../components/Feedback';
import { dateTime, money } from '../../services/format';

/** Danh sách tin/cẩm nang công khai có tìm kiếm và phân trang từ DB. */
export function ArticlesPage() {
  const [params, setParams] = useSearchParams();
  const resource = useResource('/articles?' + params);
  usePageMeta({ title: 'Tin tức & cẩm nang du lịch | Hành Trình', description: 'Tin tức, kinh nghiệm và cẩm nang cho chuyến du lịch của bạn.', path: '/articles' });
  function search(event) { event.preventDefault(); const q = new FormData(event.currentTarget).get('q'); setParams(q ? { q } : {}); }
  function page(value) { const next = new URLSearchParams(params); next.set('page', value); setParams(next); }
  return <div className="container page-space"><span className="eyebrow">CÂU CHUYỆN & KINH NGHIỆM</span><h1>Tin tức và cẩm nang</h1><form className="toolbar" onSubmit={search}><label><span className="sr-only">Tìm bài viết</span><input name="q" placeholder="Tìm chủ đề, điểm đến, kinh nghiệm…" defaultValue={params.get('q') || ''} maxLength={200} /></label><button className="button">Tìm kiếm</button></form><RequestState resource={resource}>{resource.data?.length ? <div className="article-grid">{resource.data.map(article => <article className="article-card" key={article.id}>{article.cover_image_url && <Link to={'/articles/' + article.slug}><img src={article.cover_image_url} alt={article.title} loading="lazy" /></Link>}<div><small className="muted">{dateTime(article.published_at)} · {article.author_name}</small><h2><Link to={'/articles/' + article.slug}>{article.title}</Link></h2><p>{article.summary}</p><Link className="text-button" to={'/articles/' + article.slug}>Đọc bài viết →</Link></div></article>)}</div> : <EmptyState title="Chưa có bài viết phù hợp">Hãy thử từ khóa khác hoặc quay lại khi có nội dung mới.</EmptyState>}<Pagination meta={resource.meta} onChange={page} /></RequestState></div>;
}

/** Chi tiết bài chỉ render văn bản an toàn; metadata theo nội dung thật, không nhận HTML thô. */
export function ArticleDetailPage() {
  const { slug } = useParams();
  const resource = useResource('/articles/' + encodeURIComponent(slug));
  const article = resource.data;
  usePageMeta({ title: article ? (article.meta_title || article.title) + ' | Hành Trình' : resource.error ? 'Không tìm thấy bài viết' : 'Đang tải bài viết', description: article?.meta_description || article?.summary || '', path: '/articles/' + encodeURIComponent(article?.slug || slug), image: article?.cover_image_url, index: !resource.error, data: article ? { '@context': 'https://schema.org', '@type': 'Article', headline: article.title, author: { '@type': 'Person', name: article.author_name } } : null });
  return <div className="container narrow page-space"><Link className="text-button" to="/articles">← Tin tức và cẩm nang</Link><RequestState resource={resource}>{article && <article className="article-detail"><h1>{article.title}</h1><p className="muted">{article.author_name} · {dateTime(article.published_at)}</p>{article.cover_image_url && <img className="article-cover" src={article.cover_image_url} alt={article.title} />}<p className="lead">{article.summary}</p><div className="prose article-body">{article.content}</div></article>}</RequestState></div>;
}

/** Kết quả tìm kiếm tổng hợp tour và bài viết, hoàn toàn truy cập được với Guest. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const resource = useResource('/search?q=' + encodeURIComponent(params.get('q') || ''));
  usePageMeta({ title: 'Tìm kiếm hành trình và cẩm nang', path: '/search', index: false });
  function search(event) { event.preventDefault(); setParams({ q: new FormData(event.currentTarget).get('q') || '' }); }
  return <div className="container page-space"><h1>Tìm kiếm</h1><form className="toolbar" onSubmit={search}><label><span className="sr-only">Từ khóa</span><input name="q" defaultValue={params.get('q') || ''} placeholder="Tour, điểm đến, bài viết…" maxLength={200} /></label><button className="button">Tìm kiếm</button></form><RequestState resource={resource}><h2>Hành trình</h2><div className="module-grid">{resource.data?.tours?.map(tour => <Link className="module-card" key={tour.id} to={'/tours/' + tour.slug}><h3>{tour.title}</h3><p>{tour.destination}</p><strong>{money(tour.base_price)}</strong></Link>)}</div>{!resource.data?.tours?.length && <p className="muted">Không có tour phù hợp.</p>}<h2 className="section-spacer">Bài viết</h2>{resource.data?.articles?.map(article => <article className="panel" key={article.id}><h3><Link to={'/articles/' + article.slug}>{article.title}</Link></h3><p>{article.summary}</p></article>)}{!resource.data?.articles?.length && <p className="muted">Không có bài viết phù hợp.</p>}</RequestState></div>;
}
