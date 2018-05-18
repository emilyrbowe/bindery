// Bindery
import Book from './Book';
import Page from '../Page';

// paginate
import { ignoreOverflow, isSplittable } from './canSplit';
import shiftToNextPage from './shiftToNextPage';
import { addTextNode, addTextNodeAcrossElements } from './addTextNode';
import RuleSet from './RuleSet';
import orderPages from './orderPages';
import annotatePages from './annotatePages';
import clonePath from './clonePath';
import Estimator from './Estimator';

// Utils
import { isTextNode, isUnloadedImage, isContent } from './nodeTypes';

const paginate = (content, rules, progressCallback) => {
  // Global state for a pagination run
  const estimator = new Estimator();
  const ruleSet = new RuleSet(rules);
  const book = new Book();
  const noSplit = ruleSet.selectorsNotToSplit;

  const hasOverflowed = () => book.currentPage.hasOverflowed();
  const ignoreCurrentOverflow = () => ignoreOverflow(book.currentPage.currentElement);
  const canSplitElement = el => isSplittable(el, noSplit) && !ignoreOverflow(el);
  const canSplitElementAlt = el => isSplittable(el, noSplit);

  const makeNewPage = () => {
    const newPage = new Page();
    ruleSet.applyPageStartRules(newPage, book);
    return newPage;
  };

  const finishPage = (page, allowOverflow) => {
    // finished with this page, can display
    book.pages = orderPages(book.pages, makeNewPage);
    annotatePages(book.pages);
    ruleSet.applyPageDoneRules(page, book);
    page.validateEnd(allowOverflow);
    book.validate();
  };

  // Creates clones for ever level of tag
  // we were in when we overflowed the last page
  const continueOnNewPage = (allowOverflow = false) => {
    const oldPage = book.currentPage;
    if (oldPage) finishPage(oldPage, allowOverflow);

    const newPage = makeNewPage();
    newPage.path = oldPage ? clonePath(oldPage.path, rules) : [];

    book.currentPage = newPage;
    book.pages.push(newPage);

    if (newPage.path[0]) {
      newPage.flowContent.appendChild(newPage.path[0]);
    }

    progressCallback(book); // assuming this will display new page
    newPage.validate(); // TODO: element must be in dom before validating
    return newPage;
  };

  const addTextWithoutChecks = (textNode, parent) => {
    parent.appendChild(textNode);
    if (!ignoreCurrentOverflow()) {
      book.currentPage.suppressErrors = true;
      continueOnNewPage();
    }
  };

  const addWholeTextNode = async (textNode) => {
    let hasAdded = await addTextNode(textNode, book.currentPage.currentElement, hasOverflowed);
    if (!hasAdded && !ignoreCurrentOverflow()) {
      // try on next page
      shiftToNextPage(book.currentPage, continueOnNewPage, canSplitElementAlt);
      hasAdded = await addTextNode(textNode, book.currentPage.currentElement, hasOverflowed);
    }
    if (!hasAdded) {
      addTextWithoutChecks(textNode, book.currentPage.currentElement);
    }
  };

  const continuedElement = () => {
    const newPage = continueOnNewPage();
    return newPage.currentElement;
  };

  const addSplittableTextNode = async (textNode) => {
    const el = book.currentPage.currentElement;
    let hasAdded = await addTextNodeAcrossElements(textNode, el, continuedElement, hasOverflowed);
    if (!hasAdded && book.currentPage.path.length > 1) {
      // try on next page
      shiftToNextPage(book.currentPage, continueOnNewPage, canSplitElementAlt);
      hasAdded = await addTextNodeAcrossElements(textNode, el, continuedElement, hasOverflowed);
    }
    if (!hasAdded) {
      addTextWithoutChecks(textNode, book.currentPage.currentElement);
    }
  };


  // Adds an element node by clearing its childNodes, then inserting them
  // one by one recursively until thet overflow the page
  const addElementNode = async (elementToAdd) => {
    if (hasOverflowed() && !ignoreCurrentOverflow()) {
      book.currentPage.suppressErrors = true;
      continueOnNewPage();
    }

    // Ensure images are loaded before measuring
    if (isUnloadedImage(elementToAdd)) await estimator.ensureImageLoaded(elementToAdd);

    // Transforms before adding
    const element = ruleSet.applyBeforeAddRules(elementToAdd, book, continueOnNewPage, makeNewPage);

    // Insert element
    book.currentPage.currentElement.appendChild(element);
    book.currentPage.path.push(element);

    // Clear element
    const childNodes = [...element.childNodes];
    element.innerHTML = '';

    // Overflows when empty
    if (hasOverflowed() && !ignoreCurrentOverflow()) {
      shiftToNextPage(book.currentPage, continueOnNewPage, canSplitElementAlt);
    }

    const shouldSplit = canSplitElement(element);

    for (const child of childNodes) {
      if (isTextNode(child)) {
        await (shouldSplit ? addSplittableTextNode : addWholeTextNode)(child);
      } else if (isContent(child)) {
        await addElementNode(child);
      } else {
        // Skip comments and unknown nodes
      }
    }

    // Transforms after adding
    const addedElement = book.currentPage.path.pop();
    ruleSet.applyAfterAddRules(addedElement, book, continueOnNewPage, makeNewPage);
    estimator.increment();
    book.estimatedProgress = estimator.progress;
  };

  const init = async () => {
    estimator.startWith(content);
    content.style.margin = 0;
    content.style.padding = 0;
    continueOnNewPage();

    await addElementNode(content);

    book.pages = orderPages(book.pages, makeNewPage);
    annotatePages(book.pages);

    book.setCompleted();
    ruleSet.finishEveryPage(book);
    estimator.end();

    return book;
  };

  return init();
};


export default paginate;
