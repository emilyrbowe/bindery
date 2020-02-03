import Rule from './Rule';

// Options:
// selector: String
// replace: function (HTMLElement) => HTMLElement

class Replace extends Rule {
  constructor(options) {
    super(options);
    this.name = 'Replace';
  }
  afterAdd(element, book, continueOnNewPage, makeNewPage, overflowCallback) {
    const parent = element.parentNode;
    if (!parent) {
      console.error(element);
      throw Error(`Bindery.Replace({ selector: '${this.selector}' }).afterAdd called on element that hasn't been added.`);
    }
    const defensiveClone = element.cloneNode(true);
    const replacement = this.createReplacement(book, defensiveClone);
    parent.replaceChild(replacement, element);

    if (book.currentPage.hasOverflowed()) {
      parent.replaceChild(element, replacement);

      return overflowCallback(element);
    }

    return replacement;
  }
  createReplacement(book, element) {
    return this.replace(element);
  }
  replace(element, info?) {
    element.insertAdjacentHTML('beforeEnd', '<sup class="bindery-sup">Default Replacement</sup>');
    return element;
  }
}

export default Replace;
