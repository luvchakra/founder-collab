# Generic UI/UX Design Rule for Claude

## Responsive, Professional Layout & Editable Row Design

When designing or improving any application page, Claude must **plan the layout professionally before implementing it** rather than simply adding or rearranging individual components.

### Always follow these rules

1. **Plan the page hierarchy first**
   - Establish a clear visual hierarchy: page title, supporting information, primary actions, secondary actions, content, and contextual actions.
   - Group related information logically.
   - Avoid cramped, floating, or randomly positioned controls.
   - Keep spacing, alignment, sizing, and visual rhythm consistent across the page.

2. **Use borders intentionally**
   - Add subtle borders where they improve separation, grouping, readability, or interaction clarity.
   - Do not add borders everywhere by default.
   - Prefer restrained, professional borders with appropriate radius and spacing.
   - Use elevation, spacing, dividers, or background contrast when a border is unnecessary.

3. **Place buttons properly**
   - Primary actions should be visually prominent and placed where users naturally expect them.
   - Secondary/destructive actions should not compete with the primary action.
   - Keep related actions grouped together.
   - Avoid unnecessarily large buttons, excessive button counts, or buttons placed far away from the content they affect.
   - Use consistent button sizing and hierarchy throughout the application.

4. **Make item rows actionable and editable where applicable**
   - If a row represents an editable entity, provide an obvious edit mechanism such as an Edit button, icon, inline editing, or row action menu.
   - Provide contextual actions relevant to the item without cluttering the row.
   - Keep destructive actions separated or visually distinguished from routine actions.
   - Do not force users to navigate to another page merely to perform a simple edit when inline or contextual editing is appropriate.

5. **Use the right layout for the screen size**
   - **Desktop/tablet:** Prefer a structured table when the content consists of multiple comparable records or columns. Tables should have clear column hierarchy, aligned values, useful row actions, and appropriate whitespace.
   - **Mobile:** Do not force wide desktop tables onto small screens. Convert rows into responsive cards, stacked layouts, horizontally scrollable tables, or another mobile-appropriate representation depending on the information density.
   - Adapt navigation, controls, spacing, typography, forms, and actions to the available viewport.
   - Never treat responsive design as simply shrinking the desktop layout.

6. **Design tables professionally**
   - Use meaningful column widths and alignment.
   - Keep important identifying information toward the left.
   - Keep actions toward the right where appropriate.
   - Use compact but readable row heights.
   - Support long content gracefully with truncation, wrapping, tooltips, or expandable details when needed.
   - Avoid unnecessary columns and visual noise.

7. **Prioritize usability over decoration**
   - Every visual element should have a purpose.
   - Do not add decorative cards, borders, icons, shadows, colors, or controls merely to make a page look busy.
   - The final result should feel polished, intentional, consistent, and production-ready.

8. **Preserve consistency**
   - Follow the application's existing design system, spacing scale, typography, component styles, interaction patterns, and responsive behavior.
   - When improving a page, improve the whole composition rather than styling isolated elements independently.

### Required implementation mindset

Before coding a page or major UI change, Claude should mentally evaluate:

**What is the user's primary task? → What information matters most? → What actions are needed? → What layout best supports those actions on each screen size? → Which elements should be editable?**

The implementation should then reflect that reasoning.

### Short rule

> **Always professionally plan the layout before implementation. Use structured tables on desktop when data is tabular, responsive cards/stacked layouts on mobile when appropriate, place actions where they naturally belong, add subtle borders only where they improve structure, and provide clear contextual editing options for editable items.**
