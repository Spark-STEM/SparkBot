import { describe, it, expect } from "bun:test";
import { extractModalValues } from "../src/commands/modal-handlers.ts";

describe("Modal Handlers - Value Extraction", () => {
  it("extracts text inputs and select values from Label (type 18) components", () => {
    const modalData = {
      custom_id: "spark_register_modal",
      components: [
        {
          type: 18,
          label: "Your Name",
          component: {
            type: 4,
            custom_id: "name_input",
            value: "Jane D.",
          },
        },
        {
          type: 18,
          label: "Your Chapter",
          component: {
            type: 3,
            custom_id: "chapter_select",
            values: ["2"],
          },
        },
        {
          type: 18,
          label: "Country",
          component: {
            type: 3,
            custom_id: "country_select",
            values: ["United States"],
          },
        },
      ],
    };

    const extracted = extractModalValues(modalData);
    expect(extracted).toEqual({
      name_input: "Jane D.",
      chapter_select: "2",
      country_select: "United States",
    });
  });

  it("extracts values from traditional ActionRow (type 1) wrapped inputs", () => {
    const modalData = {
      custom_id: "feedback_modal",
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "feedback_text",
              value: "Great bot!",
            },
          ],
        },
      ],
    };

    const extracted = extractModalValues(modalData);
    expect(extracted).toEqual({
      feedback_text: "Great bot!",
    });
  });

  it("handles empty or missing components gracefully", () => {
    expect(extractModalValues({})).toEqual({});
    expect(extractModalValues({ components: [] })).toEqual({});
  });
});
