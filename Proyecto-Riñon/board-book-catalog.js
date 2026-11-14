export const BOARD_BOOK = Object.freeze({
  id: 'renal-physiology-v1',
  title: 'Fisiología renal',
  author: 'Elsi Olaya Estefan',
  url: './assets/fisiologia-renal.pdf',
  pages: 109,
  aspect: 612 / 792
});
export const PAGE_SLOTS = ['p0', 'p1', 'p2', 'p3'];
export const BASE_PAGE_WIDTH = .28;
export const MIN_PAGE_WIDTH = .12;
export const MAX_PAGE_WIDTH = .45;
export const pageHeight = width => width * 1.6 / BOARD_BOOK.aspect;
export function pagePlacement(width, x, y) {
  width = Math.max(MIN_PAGE_WIDTH, Math.min(MAX_PAGE_WIDTH, width));
  return {width, x: Math.max(0, Math.min(1 - width, x)),
    y: Math.max(0, Math.min(1 - pageHeight(width), y))};
}
export function validBookPage(value) {
  return value?.bookId === BOARD_BOOK.id && typeof value.id === 'string' &&
    Number.isInteger(value.pageNumber) && value.pageNumber >= 1 && value.pageNumber <= BOARD_BOOK.pages &&
    ['x', 'y', 'width'].every(key => Number.isFinite(value[key])) &&
    value.width >= MIN_PAGE_WIDTH && value.width <= MAX_PAGE_WIDTH &&
    value.x >= 0 && value.x + value.width <= 1.000001 &&
    value.y >= 0 && value.y + pageHeight(value.width) <= 1.000001;
}
