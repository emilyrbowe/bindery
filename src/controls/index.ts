import { ViewerMode, SheetLayout, SheetSize, SheetMarks } from '../constants';

import {
  getSheetSizeLabels,
  marksLabels,
  modeLabels,
  layoutLabels,
} from './labels';

import { btn, row, div, enumDropdown } from './components';

interface ControlsState {
  paper: SheetSize;
  marks: SheetMarks;
  mode: ViewerMode;
  layout: SheetLayout;
  pageSize: { width: string; height: string };
}

interface ControlsActions {
  setMode: (newVal: ViewerMode) => void;
  setLayout: (newVal: SheetLayout) => void;
  setPaper: (newVal: SheetSize) => void;
  setMarks: (newVal: SheetMarks) => void;
}

const renderPrintOptions = (state: ControlsState, actions: ControlsActions) => {
  const shouldShowMarks =
    state.paper !== SheetSize.AUTO && state.paper !== SheetSize.AUTO_BLEED;

  const sizeLabels = getSheetSizeLabels(state.pageSize);

  return row(
    '.print-options',
    row(null, enumDropdown('bindery-choose-layout', layoutLabels, state.layout, actions.setLayout)),
    row(null, enumDropdown('bindery-choose-paper', sizeLabels, state.paper, actions.setPaper)),
    shouldShowMarks
      ? row(null, enumDropdown('bindery-choose-marks', marksLabels, state.marks, actions.setMarks))
      : '',
  );
};

class Controls {
  element: HTMLElement = div('.controls');

  update(state: ControlsState, actions: ControlsActions) {
    const oldElement = this.element;
    const newElement = this.render(state, actions);

    const focusedId = document.hasFocus() ? document.activeElement?.id : undefined;

    oldElement.replaceWith(newElement);

    if (focusedId) document.getElementById(focusedId)?.focus();

    this.element = newElement;
  }

  render(state: ControlsState, actions: ControlsActions) {
    const print = () => {
      actions.setMode(ViewerMode.PRINT);
      setTimeout(window.print, 10);
    };

    const shouldShowPrint = state.mode === ViewerMode.PRINT;

    return div(
      '.controls',
      row('.view-row', enumDropdown('bindery-choose-view', modeLabels, state.mode, actions.setMode)),
      shouldShowPrint ? renderPrintOptions(state, actions) : '',
      btn('.btn-print.btn-main', { onclick: print }, 'Print'),
    );
  }
}

export default Controls;
