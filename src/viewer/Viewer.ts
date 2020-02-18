import { Page, Book } from '../book';
import Controls from '../controls';
import { Mode, Paper, Layout, Marks } from '../constants';
import { classes, allModeClasses, classForMode, createEl } from '../dom-utils';
import { throttleFrame, throttleTime } from '../utils';
import { gridLayout, printLayout, flipLayout } from '../layouts';

import errorView from './error';
import listenForPrint from './listenForPrint';
import PageSetup from '../page-setup';

const throttleProgressBar = throttleFrame();
const throttleRender = throttleTime(100);
const throttleResize = throttleTime(50);
const document = window.document;

const makeSpread = (pgs: HTMLElement[]) => {
  return createEl('.spread-wrapper.spread-centered.spread-size', pgs);
}

interface ViewerOptions {
  pageSetup: PageSetup;
  mode: number;
  layout: number;
  marks: number;
}

class Viewer {
  book?: Book;
  pageSetup: PageSetup;

  progressBar: HTMLElement;
  content: HTMLElement;
  scaler: HTMLElement;
  element: HTMLElement;
  error?: HTMLElement;

  doubleSided: boolean;
  layout: number;
  mode: number;
  currentLeaf: number;
  controls: Controls;
  lastSpreadInProgress: any;
  hasRendered: boolean = false;

  constructor({ pageSetup, mode, layout, marks }: ViewerOptions) {
    this.pageSetup = pageSetup;

    this.progressBar = createEl('progress-bar');
    this.content = createEl('zoom-content');
    this.scaler = createEl('zoom-scaler', [this.content]);
    this.element = createEl('root', [this.progressBar, this.scaler]);

    this.doubleSided = true;
    this.layout = layout;

    this.setMarks(marks);
    this.mode = mode;
    this.element.classList.add(classes.viewPreview);
    this.currentLeaf = 0;

    listenForPrint(() => {
      this.mode = Mode.PRINT;
      this.render();
    });

    window.addEventListener('resize', () => {
      throttleResize(() => this.scaleToFit());
    });

    this.controls = new Controls(
      { Mode, Paper, Layout, Marks }, // Available options
      { // Initial props
        paper: this.pageSetup.paper,
        layout: this.layout,
        mode: this.mode,
        marks,
      },
      { // Actions
        setMode: this.setMode.bind(this),
        setPaper: this.setSheetSize.bind(this),
        setLayout: this.setLayout.bind(this),
        setMarks: this.setMarks.bind(this),
        getPageSize: () => this.pageSetup.displaySize,
      }
    );
    this.element.appendChild(this.controls.element);

    this.isInProgress = true;

    this.show();
  }

  setMode(newVal: string) {
    const newMode = parseInt(newVal, 10);
    if (newMode === this.mode) return;
    this.mode = newMode;
    this.render();
  }

  get isInProgress() {
    return this.element.classList.contains(classes.inProgress);
  }

  set isInProgress(newVal) {
    this.element.classList.toggle(classes.inProgress, newVal);
    if (newVal && this.controls) this.controls.setInProgress();
  }

  get isTwoUp() {
    return this.layout !== Layout.PAGES;
  }

  get isShowingCropMarks() {
    return this.element.classList.contains(classes.showCrop);
  }

  set isShowingCropMarks(newVal) {
    this.element.classList.toggle(classes.showCrop, newVal);
  }

  get isShowingBleedMarks() {
    return this.element.classList.contains(classes.showBleedMarks);
  }

  set isShowingBleedMarks(newVal) {
    this.element.classList.toggle(classes.showBleedMarks, newVal);
  }

  get isShowingBleed() {
    return this.element.classList.contains(classes.showBleed);
  }

  set isShowingBleed(newVal) {
    this.element.classList.toggle(classes.showBleed, newVal);
  }

  get isViewing() {
    return document.body.classList.contains(classes.isViewing);
  }

  set isViewing(newVal) {
    document.body.classList.toggle(classes.isViewing, newVal);
  }

  setSheetSize(rawVal: any) {
    const newVal = parseInt(rawVal, 10);

    this.pageSetup.paper = newVal;
    this.pageSetup.updateStyleVars();

    this.mode = Mode.PRINT;
    this.render();

    this.scaleToFit();
    setTimeout(() => { this.scaleToFit(); }, 300);
  }

  setLayout(rawVal: any) {
    const newVal = parseInt(rawVal, 10);

    if (newVal === this.layout) return;
    this.layout = newVal;

    this.pageSetup.printTwoUp = this.isTwoUp;
    this.pageSetup.updateStyleVars();

    this.mode = Mode.PRINT;
    this.render();
  }

  setMarks(rawVal: any) {
    const newVal = parseInt(rawVal, 10);
    this.isShowingCropMarks = (newVal === Marks.CROP || newVal === Marks.BOTH);
    this.isShowingBleedMarks = (newVal === Marks.BLEED || newVal === Marks.BOTH);
  }

  displayError(title: string, text: string) {
    this.show();
    if (!this.error) {
      this.error = errorView(title, text);
      this.element.appendChild(this.error);
      this.scrollToBottom();
      if (this.book) {
        const flow = this.book.currentPage.flow;
        if (flow) flow.currentElement.style.outline = '3px solid red';
      }
    }
  }

  scrollToBottom() {
    const scroll = document.scrollingElement as HTMLElement;
    if (!scroll) return;
    const scrollMax = scroll.scrollHeight - scroll.offsetHeight;
    scroll.scrollTop = scrollMax;
  }

  clear() {
    this.book = undefined;
    this.lastSpreadInProgress = undefined; // TODO: Make this clearer, after first render
    this.content.innerHTML = '';
  }

  show() {
    if (this.element.parentNode) return;
    document.body.appendChild(this.element);
    this.isViewing = true;
  }

  hide() {
    // TODO this doesn't work if the target is an existing node
    if (!this.element.parentNode) return;
    this.element.parentNode.removeChild(this.element);
    this.isViewing = false;
  }

  render(newBook?: Book) {
    if (newBook) this.book = newBook;
    if (!this.book) return;
    this.show();

    this.element.classList.remove(...allModeClasses);
    this.element.classList.add(classForMode(this.mode));
    this.isShowingBleed = this.mode === Mode.PRINT;

    const prevScroll = this.scrollPercent;

    if (this.controls) this.controls.setDone();
    this.progress = 1;

    window.requestAnimationFrame(() => {
      if (!this.book) throw Error('Book missing');
      const pages = this.book.pages.slice();
      const render = this.renderFunctionFor(this.mode);
      const fragment = render(pages, this.doubleSided, this.layout);
      this.content.innerHTML = '';
      this.content.appendChild(fragment);
      if (!this.hasRendered) this.hasRendered = true;
      else this.scrollPercent = prevScroll;

      this.scaleToFit();
    });
  }

  renderFunctionFor(mode: number) {
    if (mode === Mode.PREVIEW) return gridLayout;
    else if (mode === Mode.FLIPBOOK) return flipLayout;
    else if (mode === Mode.PRINT) return printLayout;
    throw Error(`Invalid layout mode: ${this.mode} (type ${typeof this.mode})`);
  }

  set progress(newVal: number) {
    if (newVal < 1) {
      throttleProgressBar(() => {
        this.progressBar.style.transform = `scaleX(${newVal})`;
      });
    } else {
      this.progressBar.style.transform = '';
    }
  }

  updateProgress(book: Book, estimatedProgress: number) {
    this.book = book;
    this.progress = estimatedProgress;

    if (!document || !document.scrollingElement) return;
    
    const scroller = document.scrollingElement as HTMLElement;
    // don't rerender if preview is out of view
    const scrollTop = scroller.scrollTop;
    const scrollH = scroller.scrollHeight;
    const h = scroller.offsetHeight;
    if (scrollH > h * 3 && scrollTop < h) return;

    // don't rerender too often
    throttleRender(() => this.renderProgress(book, estimatedProgress));
  }

  renderProgress(book: Book, estimatedProgress: number) {
    const needsZoomUpdate = !this.content.firstElementChild;

    const sideBySide =
      this.mode === Mode.PREVIEW
      || (this.mode === Mode.PRINT && this.layout !== Layout.PAGES);
    const limit = sideBySide ? 2 : 1;

    book.pages.forEach((page: Page, i: number) => {
      if (this.content.contains(page.element) && page.element.parentNode !== this.content) return;
      if (this.lastSpreadInProgress && this.lastSpreadInProgress.children.length < limit) {
        this.lastSpreadInProgress.appendChild(page.element);
        return;
      }
      this.lastSpreadInProgress = makeSpread([page.element]);
      if (i === 0 && sideBySide) {
        const spacer = new Page();
        spacer.element.style.visibility = 'hidden';
        this.lastSpreadInProgress.insertBefore(
          spacer.element,
          this.lastSpreadInProgress.firstElementChild
        );
      }
      this.content.appendChild(this.lastSpreadInProgress);
    });

    if (needsZoomUpdate) this.scaleToFit();
  }

  scaleToFit() {
    if (!this.content.firstElementChild) return;
    const prevScroll = this.scrollPercent;
    this.scaler.style.transform = `scale(${this.scaleThatFits})`;
    this.scrollPercent = prevScroll;
  }

  get scaleThatFits() {
    const viewerW = this.scaler.getBoundingClientRect().width;
    const contentW = this.content.getBoundingClientRect().width;
    return Math.min(1, viewerW / contentW);
  }

  get scrollPercent() {
    if (!document || !document.scrollingElement) return 0;
    const el = document.scrollingElement;
    return el.scrollTop / el.scrollHeight;
  }

  set scrollPercent(newVal) {
    if (!document || !document.scrollingElement) return;
    const el = document.scrollingElement;
    el.scrollTop = el.scrollHeight * newVal;
  }
}

export default Viewer;
