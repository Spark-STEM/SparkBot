import { assertLength, assertRequiredText, assertIntegerRange, type Builder } from "./core.ts";
type Json = Record<string, unknown>;
export class TextDisplayBuilder implements Builder {
  private readonly data: Json = { type: 10 };
  setContent(value: string) { assertRequiredText(value, "Text display content", 4000); this.data.content = value; return this; }
  toJSON() {
    if (typeof this.data.content !== "string") throw new Error("Text display content is required.");
    return this.data;
  }
}
export class SeparatorBuilder implements Builder {
  private readonly data: Json = { type: 14 };
  setSpacing(value: number) { assertIntegerRange(value, "Separator spacing", 1, 3); this.data.spacing = value; return this; }
  setDivider(value = true) { this.data.divider = value; return this; }
  toJSON() { return this.data; }
}
export class SectionBuilder implements Builder {
  private readonly data: Json = { type: 9, components: [] };
  addTextDisplayComponents(...components: TextDisplayBuilder[]) {
    (this.data.components as Json[]).push(...components.map((component) => component.toJSON())); return this;
  }
  setAccessory(component: Builder) { this.data.accessory = component.toJSON(); return this; }
  toJSON() {
    if (!(this.data.components as Json[]).length) throw new Error("Sections require at least one text display component.");
    if (!this.data.accessory) throw new Error("Sections require an accessory.");
    return this.data;
  }
}
export class ContainerBuilder implements Builder {
  private readonly data: Json = { type: 17, components: [] };
  setAccentColor(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffff) throw new Error("Container accent color must be a 24-bit integer.");
    this.data.accent_color = value;
    return this;
  }
  addComponents(...components: Builder[]) {
    (this.data.components as Json[]).push(...components.map((component) => component.toJSON())); return this;
  }
  toJSON() {
    if (!(this.data.components as Json[]).length) throw new Error("Containers require at least one component.");
    return this.data;
  }
}
export class MediaGalleryItemBuilder implements Builder {
  private readonly data: Json = {};
  setURL(value: string) { assertRequiredText(value, "Media URL"); this.data.media = { url: value }; return this; }
  setDescription(value: string) { assertLength(value, "Media description", 1024); this.data.description = value; return this; }
  toJSON() {
    if (!this.data.media) throw new Error("Media gallery items require a media URL.");
    return this.data;
  }
}
export class MediaGalleryBuilder implements Builder {
  private readonly data: Json = { type: 12, items: [] };
  addItems(...items: MediaGalleryItemBuilder[]) {
    (this.data.items as Json[]).push(...items.map((item) => item.toJSON())); return this;
  }
  toJSON() {
    if (!(this.data.items as Json[]).length) throw new Error("Media galleries require at least one item.");
    return this.data;
  }
}
export class FileBuilder implements Builder {
  private readonly data: Json = { type: 13 };
  setURL(value: string) { assertRequiredText(value, "File URL"); this.data.file = { url: value }; return this; }
  setSpoiler(value = true) { this.data.spoiler = value; return this; }
  toJSON() {
    if (!this.data.file) throw new Error("File components require a file URL.");
    return this.data;
  }
}
