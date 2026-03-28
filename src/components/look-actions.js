/**
 * Action panel for main Look screen.
 */
export class LookActions {
  /**
   * @param {HTMLElement} container
   * @param {{
   *  onAddFromWardrobe: () => void,
   *  onUploadNewItem: () => void,
   *  onUploadOutfitPhoto: () => void,
   *  onGenerateAiLook: () => void
   * }} actions
   */
  constructor(container, actions) {
    this.container = container;
    this.actions = actions;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="look-actions">
        <button class="look-actions__btn" id="look-actions-wardrobe">Add from wardrobe</button>
        <button class="look-actions__btn" id="look-actions-upload-item">Upload new item</button>
        <button class="look-actions__btn" id="look-actions-upload-outfit">Upload outfit photo</button>
        <button class="look-actions__btn look-actions__btn--primary" id="look-actions-generate">Generate AI look</button>
      </div>
    `;

    this.container.querySelector('#look-actions-wardrobe')?.addEventListener('click', () => {
      this.actions.onAddFromWardrobe();
    });
    this.container.querySelector('#look-actions-upload-item')?.addEventListener('click', () => {
      this.actions.onUploadNewItem();
    });
    this.container.querySelector('#look-actions-upload-outfit')?.addEventListener('click', () => {
      this.actions.onUploadOutfitPhoto();
    });
    this.container.querySelector('#look-actions-generate')?.addEventListener('click', () => {
      this.actions.onGenerateAiLook();
    });
  }
}
