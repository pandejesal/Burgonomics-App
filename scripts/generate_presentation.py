import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_presentation():
    prs = Presentation()
    # 16:9 Widescreen dimensions: 13.333 x 7.5 inches
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Brand Colors
    PRIMARY_GREEN = RGBColor(14, 72, 37)     # #0E4825 (30%)
    ACCENT_ORANGE = RGBColor(255, 102, 0)    # #FF6600 (10%)
    DARK_BG       = RGBColor(16, 26, 18)     # #101A12
    TEXT_DARK     = RGBColor(22, 40, 29)     # #16281D
    TEXT_MUTED    = RGBColor(88, 107, 96)    # #586B60
    WHITE         = RGBColor(255, 255, 255)
    LIGHT_BG      = RGBColor(248, 249, 248)  # #F8F9F8
    CARD_BG       = RGBColor(255, 255, 255)
    BORDER_COLOR  = RGBColor(229, 237, 231)  # #E5EDE7
    ACCENT_LIGHT  = RGBColor(255, 240, 230)

    def add_header(slide, title_text, category="BURGONOMICS DIRECT-TO-CONSUMER ECOSYSTEM"):
        # Category Tracker
        cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.45), Inches(11.5), Inches(0.3))
        tf_c = cat_box.text_frame
        tf_c.word_wrap = True
        p_c = tf_c.paragraphs[0]
        p_c.text = category.upper()
        p_c.font.size = Pt(10)
        p_c.font.bold = True
        p_c.font.color.rgb = ACCENT_ORANGE

        # Main Title
        title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.75), Inches(11.5), Inches(0.6))
        tf_t = title_box.text_frame
        tf_t.word_wrap = True
        p_t = tf_t.paragraphs[0]
        p_t.text = title_text
        p_t.font.size = Pt(22)
        p_t.font.bold = True
        p_t.font.color.rgb = PRIMARY_GREEN

    # -------------------------------------------------------------
    # SLIDE 1: Title Slide (Dark Theme Hero)
    # -------------------------------------------------------------
    slide1 = prs.slides.add_slide(blank_layout)
    bg1 = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = DARK_BG
    bg1.line.fill.background()

    # Top accent bar
    top_bar = slide1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(0.12))
    top_bar.fill.solid()
    top_bar.fill.fore_color.rgb = ACCENT_ORANGE
    top_bar.line.fill.background()

    # Title Box
    tbox = slide1.shapes.add_textbox(Inches(1.0), Inches(1.8), Inches(11.3), Inches(3.8))
    tf1 = tbox.text_frame
    tf1.word_wrap = True

    p0 = tf1.paragraphs[0]
    p0.text = "100% PURE VEGETARIAN • DIRECT-TO-CONSUMER MOBILE PLATFORM"
    p0.font.size = Pt(12)
    p0.font.bold = True
    p0.font.color.rgb = ACCENT_ORANGE
    p0.space_after = Pt(14)

    p1 = tf1.add_paragraph()
    p1.text = "BURGONOMICS"
    p1.font.size = Pt(44)
    p1.font.bold = True
    p1.font.color.rgb = WHITE
    p1.space_after = Pt(10)

    p2 = tf1.add_paragraph()
    p2.text = "Next-Generation Multi-Outlet Ordering & Operations Architecture"
    p2.font.size = Pt(20)
    p2.font.color.rgb = RGBColor(200, 220, 205)
    p2.space_after = Pt(24)

    p3 = tf1.add_paragraph()
    p3.text = "Executive & Brand Leadership Presentation • August 2026"
    p3.font.size = Pt(13)
    p3.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 2: Executive Summary & Strategic Value
    # -------------------------------------------------------------
    slide2 = prs.slides.add_slide(blank_layout)
    add_header(slide2, "Strategic Value: Owning the D2C Customer Relationship", "Executive Summary")

    cards_data_s2 = [
        ("Zero Aggregator Cut", "Direct Margin Expansion", "Save 15% - 30% per order currently paid in commissions to third-party food aggregators, dramatically lifting store-level EBITDA."),
        ("Direct Customer Loyalty", "1st-Party Data Ownership", "Full ownership of customer profiles, purchase history, order frequency, and phone numbers for targeted WhatsApp/SMS re-engagement."),
        ("Multi-Store Scale", "16+ Outlets Unified", "Seamless routing across corporate and franchise kitchens in Ahmedabad, Surat, and future expansion cities under one premium brand."),
        ("Instant Kitchen KOT", "Petpooja Automation", "Orders flow directly into kitchen order ticket printers with zero manual entry, zero bill tampering, and full operational sync.")
    ]

    for i, (tag, title, desc) in enumerate(cards_data_s2):
        col = i % 2
        row = i // 2
        left = Inches(0.8 + col * 5.9)
        top = Inches(1.6 + row * 2.6)
        
        card = slide2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, Inches(5.6), Inches(2.3))
        card.fill.solid()
        card.fill.fore_color.rgb = LIGHT_BG
        card.line.color.rgb = BORDER_COLOR
        card.line.width = Pt(1.5)

        tb = slide2.shapes.add_textbox(left + Inches(0.3), top + Inches(0.2), Inches(5.0), Inches(1.9))
        tf = tb.text_frame
        tf.word_wrap = True

        ptag = tf.paragraphs[0]
        ptag.text = tag.upper()
        ptag.font.size = Pt(10)
        ptag.font.bold = True
        ptag.font.color.rgb = ACCENT_ORANGE
        ptag.space_after = Pt(4)

        ptit = tf.add_paragraph()
        ptit.text = title
        ptit.font.size = Pt(15)
        ptit.font.bold = True
        ptit.font.color.rgb = PRIMARY_GREEN
        ptit.space_after = Pt(6)

        pdesc = tf.add_paragraph()
        pdesc.text = desc
        pdesc.font.size = Pt(11)
        pdesc.font.color.rgb = TEXT_DARK

    # -------------------------------------------------------------
    # SLIDE 3: The Mobile Experience
    # -------------------------------------------------------------
    slide3 = prs.slides.add_slide(blank_layout)
    add_header(slide3, "Mobile App Features & Customer Experience", "Product Highlights")

    features = [
        ("📍 Intelligent Store Discovery", "GPS-powered automatic proximity detection. Customers see distance (km) and delivery/pickup ETA in minutes across all 16 locations."),
        ("🍔 Dynamic Rich Menu (63 Items)", "Full catalog with high-res food photography, category carousels, customizable burger modifiers, and combo deals."),
        ("⚡ 60fps Native Gestures", "Built on Capacitor 8 & high-performance touch delegate. Dual-axis scroll allows seamless diagonal swipe on rails without sticking."),
        ("🎨 60-30-10 Brand Theme", "Curated visual identity: 60% White/Black canvas, 30% Deep Forest Green (#0E4825), and 10% Appetite Accent Orange (#FF6600)."),
        ("🛍️ Flexible Fulfillment", "Full support for Delivery, Quick Takeaway, and Dine-In with automated minimum cart and delivery fee tier calculations."),
        ("🔒 Bank-Grade Security", "Server-authoritative pricing eliminates cart tampering. Razorpay payment signatures are validated on secure backend.")
    ]

    for i, (title, desc) in enumerate(features):
        col = i % 3
        row = i // 3
        left = Inches(0.8 + col * 3.9)
        top = Inches(1.6 + row * 2.6)

        card = slide3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, Inches(3.7), Inches(2.3))
        card.fill.solid()
        card.fill.fore_color.rgb = WHITE
        card.line.color.rgb = BORDER_COLOR
        card.line.width = Pt(1.5)

        tb = slide3.shapes.add_textbox(left + Inches(0.2), top + Inches(0.18), Inches(3.3), Inches(1.9))
        tf = tb.text_frame
        tf.word_wrap = True

        ptit = tf.paragraphs[0]
        ptit.text = title
        ptit.font.size = Pt(13)
        ptit.font.bold = True
        ptit.font.color.rgb = PRIMARY_GREEN
        ptit.space_after = Pt(6)

        pdesc = tf.add_paragraph()
        pdesc.text = desc
        pdesc.font.size = Pt(10.5)
        pdesc.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 4: Payment Routing Architecture (Razorpay Options)
    # -------------------------------------------------------------
    slide4 = prs.slides.add_slide(blank_layout)
    add_header(slide4, "Razorpay Architecture: Multi-Store Payment & Revenue Routing", "Payment Infrastructure")

    options = [
        ("RECOMMENDED FOR FRANCHISES", "Option A: Razorpay Route (Split Transfers)",
         "• Master Razorpay account for Burgonomics HQ.\n• Each franchise outlet onboarded as a Linked Account (acc_xxx).\n• Order ₹500 at Mansi Circle: ₹450 automatically settles into Franchisee bank account, ₹50 (10% brand royalty) settles into HQ account.\n• Eliminates manual reconciliation; unified brand on UPI/cards."),
        
        ("BEST FOR CORPORATE-OWNED", "Option B: Single Central Master Account",
         "• All payments from all 16 outlets flow into one primary corporate bank account.\n• Every order is tagged with storeId in metadata.\n• Central finance team reconciles outlet-wise revenue and transfers store payouts monthly/weekly based on POS reports."),
        
        ("INDEPENDENT LEGAL ENTITIES", "Option C: Dynamic Per-Store Keys",
         "• If each outlet has distinct legal registrations & Razorpay credentials.\n• Backend securely loads store-specific keyId/secret dynamically per order.\n• Customer pays directly into that store's independent merchant account.")
    ]

    for i, (tag, title, desc) in enumerate(options):
        left = Inches(0.8 + i * 3.9)
        top = Inches(1.6)

        card = slide4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, Inches(3.7), Inches(5.2))
        card.fill.solid()
        card.fill.fore_color.rgb = LIGHT_BG if i != 0 else ACCENT_LIGHT
        card.line.color.rgb = BORDER_COLOR if i != 0 else ACCENT_ORANGE
        card.line.width = Pt(1.5 if i != 0 else 2.0)

        tb = slide4.shapes.add_textbox(left + Inches(0.25), top + Inches(0.25), Inches(3.2), Inches(4.7))
        tf = tb.text_frame
        tf.word_wrap = True

        ptag = tf.paragraphs[0]
        ptag.text = tag
        ptag.font.size = Pt(9.5)
        ptag.font.bold = True
        ptag.font.color.rgb = ACCENT_ORANGE
        ptag.space_after = Pt(6)

        ptit = tf.add_paragraph()
        ptit.text = title
        ptit.font.size = Pt(14)
        ptit.font.bold = True
        ptit.font.color.rgb = PRIMARY_GREEN
        ptit.space_after = Pt(10)

        pdesc = tf.add_paragraph()
        pdesc.text = desc
        pdesc.font.size = Pt(10.5)
        pdesc.font.color.rgb = TEXT_DARK

    # -------------------------------------------------------------
    # SLIDE 5: Petpooja POS & Kitchen Automation
    # -------------------------------------------------------------
    slide5 = prs.slides.add_slide(blank_layout)
    add_header(slide5, "Petpooja POS & Kitchen Order Ticket (KOT) Integration", "POS & Kitchen Operations")

    workflow_steps = [
        ("Step 1: Order Placed", "Customer selects outlet (e.g. Navrangpura) & completes checkout on mobile app."),
        ("Step 2: Backend Routing", "Server resolves store's unique Petpooja ID (petpoojaRestId) and pricing rules."),
        ("Step 3: Petpooja Push", "Order is dispatched via secure API directly to Petpooja Cloud with exact item modifiers."),
        ("Step 4: Kitchen KOT Print", "Instant KOT printout at that store's kitchen counter + POS register display update.")
    ]

    for i, (stitle, sdesc) in enumerate(workflow_steps):
        left = Inches(0.8 + i * 2.9)
        top = Inches(1.7)

        card = slide5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, Inches(2.7), Inches(2.2))
        card.fill.solid()
        card.fill.fore_color.rgb = WHITE
        card.line.color.rgb = BORDER_COLOR
        card.line.width = Pt(1.5)

        tb = slide5.shapes.add_textbox(left + Inches(0.18), top + Inches(0.2), Inches(2.34), Inches(1.8))
        tf = tb.text_frame
        tf.word_wrap = True

        ptit = tf.paragraphs[0]
        ptit.text = stitle
        ptit.font.size = Pt(13)
        ptit.font.bold = True
        ptit.font.color.rgb = PRIMARY_GREEN
        ptit.space_after = Pt(6)

        pdesc = tf.add_paragraph()
        pdesc.text = sdesc
        pdesc.font.size = Pt(10)
        pdesc.font.color.rgb = TEXT_MUTED

    # Bottom Callout Box
    cbox = slide5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.8), Inches(4.3), Inches(11.7), Inches(2.4))
    cbox.fill.solid()
    cbox.fill.fore_color.rgb = LIGHT_BG
    cbox.line.color.rgb = PRIMARY_GREEN
    cbox.line.width = Pt(1.5)

    ctb = slide5.shapes.add_textbox(Inches(1.1), Inches(4.5), Inches(11.1), Inches(2.0))
    ctf = ctb.text_frame
    ctf.word_wrap = True

    cp0 = ctf.paragraphs[0]
    cp0.text = "PETPOOJA SYNC READY: TRANSITION FROM DEMO TO PRODUCTION"
    cp0.font.size = Pt(11)
    cp0.font.bold = True
    cp0.font.color.rgb = ACCENT_ORANGE
    cp0.space_after = Pt(4)

    cp1 = ctf.add_paragraph()
    cp1.text = "• Pre-Seeded Catalog: 16 Outlets & 63 Products are pre-seeded with high-fidelity demo assets for full end-to-end evaluation.\n• Plug-and-Play Credentials: As soon as live Petpooja API keys and outlet mapping IDs are configured, real-time item 86-ing (out of stock) and live menu sync activate automatically without app rebuild."
    cp1.font.size = Pt(11.5)
    cp1.font.color.rgb = TEXT_DARK

    # -------------------------------------------------------------
    # SLIDE 6: Engineering Rigor & Security
    # -------------------------------------------------------------
    slide6 = prs.slides.add_slide(blank_layout)
    add_header(slide6, "Technical Architecture, Security & Code Health", "Engineering Standards")

    tech_cards = [
        ("TypeScript & Vitest", "Zero Errors, 100% Type-Safe", "Complete codebase runs with 0 TypeScript compilation errors and 32/32 automated unit and parity tests passing cleanly."),
        ("Server Pricing Engine", "Zero Cart Tampering", "Discounts, taxes (GST 5%), delivery charges, and packaging fees are calculated strictly on the server to prevent client manipulation."),
        ("Firestore Security Lockdown", "Principle of Least Privilege", "Customers can only create pending orders; updating, editing, or deleting orders is blocked by database-level security rules."),
        ("Cross-Platform Android 16 & iOS", "Native Hardware Integration", "Native haptic feedback on add-to-cart, background GPS geolocation, and splash screen animations powered by Capacitor 8.")
    ]

    for i, (tag, title, desc) in enumerate(tech_cards):
        col = i % 2
        row = i // 2
        left = Inches(0.8 + col * 5.9)
        top = Inches(1.6 + row * 2.6)

        card = slide6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, Inches(5.6), Inches(2.3))
        card.fill.solid()
        card.fill.fore_color.rgb = WHITE
        card.line.color.rgb = BORDER_COLOR
        card.line.width = Pt(1.5)

        tb = slide6.shapes.add_textbox(left + Inches(0.3), top + Inches(0.2), Inches(5.0), Inches(1.9))
        tf = tb.text_frame
        tf.word_wrap = True

        ptag = tf.paragraphs[0]
        ptag.text = tag.upper()
        ptag.font.size = Pt(10)
        ptag.font.bold = True
        ptag.font.color.rgb = ACCENT_ORANGE
        ptag.space_after = Pt(4)

        ptit = tf.add_paragraph()
        ptit.text = title
        ptit.font.size = Pt(14)
        ptit.font.bold = True
        ptit.font.color.rgb = PRIMARY_GREEN
        ptit.space_after = Pt(6)

        pdesc = tf.add_paragraph()
        pdesc.text = desc
        pdesc.font.size = Pt(10.5)
        pdesc.font.color.rgb = TEXT_DARK

    # -------------------------------------------------------------
    # SLIDE 7: Launch Roadmap & Next Milestones
    # -------------------------------------------------------------
    slide7 = prs.slides.add_slide(blank_layout)
    add_header(slide7, "Launch Roadmap & Production Finalization", "Go-To-Market Plan")

    phases = [
        ("PHASE 1 (TODAY)", "Executive Demo & Feedback", "• Walkthrough on Android device RZCX51TXRKB.\n• Review store coverage, visual menu, and cart flows.\n• Align on Razorpay routing option (Route vs Central)."),
        ("PHASE 2 (WEEK 1)", "Petpooja Live Binding", "• Plug in Petpooja production API credentials.\n• Map restID for each of the 16 stores.\n• Perform live test KOT prints at pilot store counter."),
        ("PHASE 3 (WEEK 2)", "Razorpay KYC & Webhooks", "• Complete Razorpay merchant account activation.\n• Set up webhook listener for instant payment capture.\n• Verify automated UPI & Card checkout flows."),
        ("PHASE 4 (LAUNCH)", "Store Release & Marketing", "• Publish Android APK to Google Play Store.\n• Submit iOS bundle to Apple App Store.\n• In-store QR codes & social launch campaign.")
    ]

    for i, (tag, title, desc) in enumerate(phases):
        left = Inches(0.8 + i * 2.9)
        top = Inches(1.6)

        card = slide7.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, Inches(2.7), Inches(5.2))
        card.fill.solid()
        card.fill.fore_color.rgb = WHITE
        card.line.color.rgb = BORDER_COLOR if i != 0 else ACCENT_ORANGE
        card.line.width = Pt(1.5 if i != 0 else 2.0)

        tb = slide7.shapes.add_textbox(left + Inches(0.18), top + Inches(0.25), Inches(2.34), Inches(4.7))
        tf = tb.text_frame
        tf.word_wrap = True

        ptag = tf.paragraphs[0]
        ptag.text = tag
        ptag.font.size = Pt(9.5)
        ptag.font.bold = True
        ptag.font.color.rgb = ACCENT_ORANGE
        ptag.space_after = Pt(6)

        ptit = tf.add_paragraph()
        ptit.text = title
        ptit.font.size = Pt(13)
        ptit.font.bold = True
        ptit.font.color.rgb = PRIMARY_GREEN
        ptit.space_after = Pt(10)

        pdesc = tf.add_paragraph()
        pdesc.text = desc
        pdesc.font.size = Pt(10)
        pdesc.font.color.rgb = TEXT_DARK

    # -------------------------------------------------------------
    # SLIDE 8: Thank You & Live Demo Handover
    # -------------------------------------------------------------
    slide8 = prs.slides.add_slide(blank_layout)
    bg8 = slide8.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg8.fill.solid()
    bg8.fill.fore_color.rgb = DARK_BG
    bg8.line.fill.background()

    top_bar8 = slide8.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(0.12))
    top_bar8.fill.solid()
    top_bar8.fill.fore_color.rgb = ACCENT_ORANGE
    top_bar8.line.fill.background()

    tbox8 = slide8.shapes.add_textbox(Inches(1.0), Inches(2.0), Inches(11.3), Inches(3.5))
    tf8 = tbox8.text_frame
    tf8.word_wrap = True

    p0_8 = tf8.paragraphs[0]
    p0_8.text = "THE HOUSE OF DAMN GOOD BURGERS"
    p0_8.font.size = Pt(13)
    p0_8.font.bold = True
    p0_8.font.color.rgb = ACCENT_ORANGE
    p0_8.space_after = Pt(14)

    p1_8 = tf8.add_paragraph()
    p1_8.text = "Ready for Live Device Walkthrough"
    p1_8.font.size = Pt(40)
    p1_8.font.bold = True
    p1_8.font.color.rgb = WHITE
    p1_8.space_after = Pt(14)

    p2_8 = tf8.add_paragraph()
    p2_8.text = "Let's tap through the app on device RZCX51TXRKB.\nQuestions & Discussion."
    p2_8.font.size = Pt(18)
    p2_8.font.color.rgb = RGBColor(200, 220, 205)

    output_path = "c:\\Users\\DELL\\Desktop\\Burgonomics\\BURGONOMICS_Executive_Demo_Presentation.pptx"
    prs.save(output_path)
    print(f"Presentation saved successfully to {output_path}")

if __name__ == "__main__":
    create_presentation()
