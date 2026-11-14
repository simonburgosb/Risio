import {BOARD_BOOK, BASE_PAGE_WIDTH, PAGE_SLOTS, pageHeight, validBookPage, pagePlacement} from './board-book-catalog.js';

export class BoardBookPages {
  constructor({getSession, canvas, repaint, error, selectTool, activate}) {
    Object.assign(this, {getSession, canvas, repaint, error, selectTool, activate});
    this.pages = [];
    this.cache = new Map();
    this.previewGeneration = 0;
    this.$ = id => document.getElementById(id);
    this.dialog = this.$('board-book-dialog');
    this.input = this.$('board-book-page');
    this.preview = this.$('board-book-preview');
    this.add = this.$('board-book-submit');
    this.$('board-add-page').addEventListener('click', () => this.open());
    this.$('board-book-close').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => {
      this.previewGeneration++;
      this.previewReady = null;
      this.$('board-add-page').focus();
    });
    this.$('board-book-refresh').addEventListener('click', () => this.updatePreview());
    this.input.addEventListener('input', () => {
      this.add.disabled = true;
      clearTimeout(this.previewTimer);
      this.previewGeneration++;
      this.previewTimer = setTimeout(() => this.updatePreview(), 180);
    });
    this.$('board-book-form').addEventListener('submit', event => this.submit(event));
    this.$('board-page-selection').addEventListener('change', event => {
      this.selectedId = event.target.value;
      this.activate?.();
      this.updateControls();
      this.repaint();
    });
    for (const [id, factor] of [['board-page-smaller', 1 / 1.15], ['board-page-larger', 1.15]]) {
      this.$(id).addEventListener('click', () => this.action(page =>
        this.getSession().resizeBookPage(page.slot, page.id, factor)));
    }
    this.$('board-page-remove').addEventListener('click', () => this.action(page =>
      this.getSession().removeBookPage(page.slot, page.id)));
    this.$('board-page-retry').addEventListener('click', () => {
      const page = this.selected();
      if (!page) return;
      this.cache.delete(page.pageNumber);
      this.load(page.pageNumber).then(() => this.repaint(), () => this.repaint());
      this.updateControls();
    });
  }

  reset() {
    this.pages = [];
    this.drag = null;
    this.key = '';
    this.selectedId = null;
    if (this.dialog.open) this.dialog.close();
    this.updateControls();
    this.repaint();
  }

  async document() {
    if (!this.pdf) this.pdf = (async () => {
      const pdfjs = await import('./vendor/pdfjs/build/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/build/pdf.worker.mjs', import.meta.url).href;
      return pdfjs.getDocument({
        url: new URL(BOARD_BOOK.url, import.meta.url).href,
        cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
        standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
        wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href,
        iccUrl: new URL('./vendor/pdfjs/iccs/', import.meta.url).href
      }).promise;
    })().catch(error => { this.pdf = null; throw error; });
    return this.pdf;
  }

  load(number) {
    if (this.cache.has(number)) return this.cache.get(number).promise;
    for (const key of this.cache.keys()) {
      if (this.cache.size < 6) break;
      if (!this.pages.some(page => page.pageNumber === key) && key !== Number(this.input.value)) this.cache.delete(key);
    }
    const entry = {};
    this.cache.set(number, entry);
    entry.promise = (async () => {
      const pdf = await this.document();
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({scale: 1200 / page.getViewport({scale: 1}).width});
      const image = document.createElement('canvas');
      image.width = Math.ceil(viewport.width);
      image.height = Math.ceil(viewport.height);
      await page.render({canvasContext: image.getContext('2d'), viewport}).promise;
      page.cleanup();
      entry.image = image;
      this.updateControls();
      return image;
    })().catch(error => {
      entry.error = true;
      this.updateControls();
      throw error;
    });
    return entry.promise;
  }

  sync(values = {}) {
    const key = JSON.stringify(values);
    if (key !== this.key) {
      this.key = key;
      this.pages = PAGE_SLOTS.flatMap(slot => validBookPage(values[slot]) ? [{...values[slot], slot}] : []);
      if (!this.selected()) this.selectedId = this.pages.at(-1)?.id;
      if (this.drag && !this.pages.some(page => page.id === this.drag.id)) this.drag = null;
      const select = this.$('board-page-selection');
      select.replaceChildren(...this.pages.map(page => {
        const option = document.createElement('option');
        option.value = page.id;
        option.textContent = 'Fisiología renal · página ' + page.pageNumber;
        return option;
      }));
      select.value = this.selectedId || '';
      for (const page of this.pages) {
        this.load(page.pageNumber).then(() => this.repaint(), () => this.repaint());
      }
      this.repaint();
    }
    if (!this.getSession()?.canDraw && this.drag) this.cancelDrag();
    this.updateControls();
  }

  selected() { return this.pages.find(page => page.id === this.selectedId); }
  frame(id) {
    const page = this.pages.find(page => page.id === id);
    return page && this.drag?.id === id ? {...page, ...this.drag.preview} : page;
  }
  hit(point) {
    return [...this.pages].reverse().find(page => {
      const p = this.frame(page.id);
      return point[0] >= p.x && point[0] <= p.x + p.width &&
        point[1] >= p.y && point[1] <= p.y + pageHeight(p.width);
    });
  }
  local(point, id) {
    const page = this.frame(id);
    if (!page) return null;
    const scale = page.width / BASE_PAGE_WIDTH;
    return [Math.max(0, Math.min(1, (point[0] - page.x) / scale)),
      Math.max(0, Math.min(1, (point[1] - page.y) / scale))];
  }
  board(point, id) {
    const page = this.frame(id);
    if (!page) return null;
    const scale = page.width / BASE_PAGE_WIDTH;
    return [page.x + point[0] * scale, page.y + point[1] * scale];
  }

  draw(ctx, id) {
    for (const source of this.pages.filter(page=>!id || page.id===id)) {
      ctx.save(); ctx.globalAlpha=1;
      const page = this.frame(source.id), image = this.cache.get(page.pageNumber)?.image;
      const x = page.x * 1600, y = page.y * 1000, width = page.width * 1600, height = pageHeight(page.width) * 1000;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, width, height);
      if (image) ctx.drawImage(image, x, y, width, height);
      else {
        ctx.fillStyle = '#463a35';
        ctx.font = '18px Arial';
        ctx.textBaseline = 'top';
        ctx.fillText(this.cache.get(page.pageNumber)?.error ? 'No se pudo cargar la página.' : 'Cargando página…', x + 12, y + 12, width - 24);
      }
      ctx.strokeStyle = '#c79784';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    }
  }

  anchored(ctx, value, draw) {
    if (!value.pageId) { draw(); return; }
    const page = this.frame(value.pageId);
    if (!page) return;
    ctx.save();
    ctx.translate(page.x * 1600, page.y * 1000);
    ctx.scale(page.width / BASE_PAGE_WIDTH, page.width / BASE_PAGE_WIDTH);
    ctx.beginPath();
    ctx.rect(0, 0, BASE_PAGE_WIDTH * 1600, pageHeight(BASE_PAGE_WIDTH) * 1000);
    ctx.clip();
    draw();
    ctx.restore();
  }

  startDrag(event, point) {
    const page = this.hit(point);
    if (!page || this.busy || !this.getSession()?.canDraw) return;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.selectedId = page.id;
    this.$('board-page-selection').value = page.id;
    this.drag = {pointer: event.pointerId, id: page.id, slot: page.slot, start: point, original: page, preview: page};
    this.updateControls();
  }
  moveDrag(event, point) {
    if (!this.drag || this.drag.pointer !== event.pointerId) return false;
    const {original, start} = this.drag;
    this.drag.delta = [point[0] - start[0], point[1] - start[1]];
    this.drag.preview = pagePlacement(original.width, original.x + this.drag.delta[0], original.y + this.drag.delta[1]);
    this.repaint();
    return true;
  }
  endDrag(event) {
    const drag = this.drag;
    if (!drag || drag.pointer !== event.pointerId) return false;
    this.drag = null;
    if (drag.delta) this.action(() => this.getSession().moveBookPage(drag.slot, drag.id, ...drag.delta));
    this.repaint();
    return true;
  }
  cancelDrag() { this.drag = null; this.repaint(); }

  async action(operation) {
    if (this.busy || !this.getSession()?.canDraw) return;
    const page = this.selected();
    if (!page) return;
    this.busy = true;
    this.updateControls();
    try { await operation(page); } catch (error) { this.error(error); }
    finally { this.busy = false; this.updateControls(); }
  }

  updateControls() {
    const canDraw = Boolean(this.getSession()?.canDraw), page = this.selected();
    this.$('board-add-page').disabled = !canDraw || this.pages.length >= PAGE_SLOTS.length;
    if(!canDraw || this.pages.length >= PAGE_SLOTS.length) this.add.disabled = true;
    this.$('board-page-controls').hidden = !this.pages.length;
    this.$('board-page-tool').hidden = !this.pages.length;
    for (const id of ['board-page-smaller', 'board-page-larger', 'board-page-remove']) {
      this.$(id).disabled = !canDraw || this.busy || !page;
    }
    this.$('board-page-smaller').disabled ||= page?.width <= .12;
    this.$('board-page-larger').disabled ||= page?.width >= .45;
    this.$('board-page-retry').hidden = !page || !this.cache.get(page.pageNumber)?.error;
    this.$('board-page-status').textContent = this.busy ? 'Guardando página…'
      : page ? 'Página ' + page.pageNumber + ' · ' + Math.round(page.width / BASE_PAGE_WIDTH * 100) + ' %' : '';
  }

  open() {
    if (!this.getSession()?.canDraw) return;
    this.roomId = this.getSession().meta.id;
    this.input.value = this.selected()?.pageNumber || 1;
    this.$('board-book-error').textContent = '';
    this.dialog.showModal();
    this.updatePreview();
  }
  async updatePreview() {
    const generation = ++this.previewGeneration, number = Number(this.input.value);
    this.add.disabled = true;
    this.previewReady = null;
    this.preview.hidden = true;
    this.$('board-book-error').textContent = '';
    if (!Number.isInteger(number) || number < 1 || number > BOARD_BOOK.pages) {
      this.$('board-book-status').textContent = 'Elige una página entre 1 y 109.';
      return;
    }
    this.$('board-book-status').textContent = 'Preparando vista previa…';
    if (this.cache.get(number)?.error) this.cache.delete(number);
    try {
      const image = await this.load(number);
      if (generation !== this.previewGeneration || !this.dialog.open) return;
      this.preview.width = image.width;
      this.preview.height = image.height;
      this.preview.getContext('2d').drawImage(image, 0, 0);
      this.preview.hidden = false;
      this.previewReady = number;
      this.add.disabled = !this.getSession()?.canDraw || this.pages.length >= PAGE_SLOTS.length;
      this.$('board-book-status').textContent = 'Página ' + number + ' de 109';
    } catch {
      if (generation === this.previewGeneration) this.$('board-book-status').textContent = 'No se pudo cargar el libro. Revisa la conexión y pulsa Actualizar vista previa.';
    }
  }
  async submit(event) {
    event.preventDefault();
    const session = this.getSession(), number = Number(this.input.value);
    if (this.add.disabled || number !== this.previewReady || this.roomId !== session?.meta?.id) return;
    this.add.disabled = true;
    try {
      this.selectedId = await session.addBookPage(number);
      this.$('board-page-selection').value = this.selectedId;
      this.updateControls();
      this.repaint();
      this.dialog.close();
      this.selectTool('pen');
    } catch (error) {
      this.$('board-book-error').textContent = error.message;
      this.add.disabled = false;
    }
  }
}
