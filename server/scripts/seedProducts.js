// Seeds the catalog with realistic boutique products for demo/testing.
// Writes directly via the Mongoose models (like seedAdmin.js) rather than
// through the HTTP API, since createStyle expects multipart/Cloudinary and
// we don't need real product photos for this.
//   node scripts/seedProducts.js [count]   (default 100)
require('dotenv').config();
const mongoose = require('mongoose');
const Style = require('../models/Style');
const Variant = require('../models/Variant');

const CATEGORIES = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Accessories', 'Footwear'];

const STYLE_NAMES = {
  Tops: ['Silk Blouse', 'Cotton Tee', 'Ruffle Top', 'Off-Shoulder Top', 'Crop Top', 'Button-Down Shirt', 'Turtleneck Sweater', 'Wrap Top', 'Peplum Top', 'Halter Top'],
  Bottoms: ['Wide-Leg Trousers', 'Skinny Jeans', 'Pleated Skirt', 'Midi Skirt', 'Palazzo Pants', 'Denim Shorts', 'Culottes', 'Cargo Pants'],
  Dresses: ['Floral Wrap Dress', 'Maxi Dress', 'Cocktail Dress', 'Bodycon Dress', 'A-Line Dress', 'Slip Dress', 'Shirt Dress', 'Tiered Dress'],
  Outerwear: ['Trench Coat', 'Denim Jacket', 'Blazer', 'Cardigan', 'Puffer Jacket', 'Wool Coat', 'Bomber Jacket'],
  Accessories: ['Leather Belt', 'Silk Scarf', 'Tote Bag', 'Sunglasses', 'Statement Necklace', 'Clutch Bag', 'Wide-Brim Hat'],
  Footwear: ['Ankle Boots', 'Strappy Heels', 'Canvas Sneakers', 'Leather Loafers', 'Flat Sandals', 'Platform Heels'],
};

const ADJECTIVES = ['Classic', 'Modern', 'Vintage', 'Chic', 'Elegant', 'Casual', 'Boho', 'Minimalist', 'Tailored', 'Relaxed', 'Bold', 'Signature'];
const BRANDS = ['Wanguvibe Originals', 'Nairobi Threads', 'Savanna Chic', 'Urban Elegance', 'Zawadi Collection', 'Kilimani Couture'];
const COLORS = ['Black', 'White', 'Navy', 'Beige', 'Red', 'Olive', 'Blush', 'Charcoal', 'Mustard', 'Emerald', 'Burgundy', 'Ivory'];
const MATERIALS = ['Cotton', 'Silk', 'Linen', 'Polyester Blend', 'Denim', 'Leather', 'Wool Blend', 'Chiffon'];
const SEASONS = ['Permanent Collection', 'SS26', 'AW25'];

const PRICE_RANGES = {
  Tops: [800, 2500], Bottoms: [1200, 3500], Dresses: [2000, 6000],
  Outerwear: [3000, 8000], Accessories: [500, 3000], Footwear: [2000, 6000],
};

const SIZE_SETS = {
  Tops: ['XS', 'S', 'M', 'L', 'XL'],
  Bottoms: ['XS', 'S', 'M', 'L', 'XL'],
  Dresses: ['XS', 'S', 'M', 'L', 'XL'],
  Outerwear: ['S', 'M', 'L', 'XL'],
  Accessories: ['One Size'],
  Footwear: ['37', '38', '39', '40', '41', '42'],
};

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  for (let i = 0; i < n && copy.length; i++) out.push(copy.splice(rand(0, copy.length - 1), 1)[0]);
  return out;
}
const roundTo50 = (n) => Math.round(n / 50) * 50;

async function main() {
  const targetCount = parseInt(process.argv[2], 10) || 100;

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Seeding ${targetCount} styles...`);

  let skuCounter = 10000;
  let stylesCreated = 0;
  let variantsCreated = 0;

  for (let i = 0; i < targetCount; i++) {
    const category = CATEGORIES[i % CATEGORIES.length];
    const nameBase = pick(STYLE_NAMES[category]);
    const [minP, maxP] = PRICE_RANGES[category];
    const basePrice = roundTo50(rand(minP, maxP));

    const style = await Style.create({
      name: `${pick(ADJECTIVES)} ${nameBase}`,
      styleCode: `${category.slice(0, 3).toUpperCase()}-${1000 + i}`,
      brand: pick(BRANDS),
      description: `${nameBase} crafted in premium ${pick(MATERIALS).toLowerCase()}.`,
      category,
      season: pick(SEASONS),
      material: pick(MATERIALS),
      basePrice,
      costPrice: Math.round(basePrice * 0.45),
      images: [],
      active: true,
    });
    stylesCreated++;

    const sizes = SIZE_SETS[category];
    // Sizes are picked independently (with repeats allowed) rather than
    // sampled-without-replacement, since some categories (Accessories) only
    // have one size. That's safe because colors are always sampled distinct
    // per variant below, and the {style,size,color} unique index only needs
    // the *pair* to be unique — distinct colors alone already guarantee that.
    const numVariants = rand(2, 4);
    const chosenColors = pickN(COLORS, numVariants);

    for (let v = 0; v < numVariants; v++) {
      skuCounter++;
      const size = pick(sizes);
      const color = chosenColors[v];

      // ~8% out of stock, ~12% low stock (below a threshold of 2-5), rest healthy
      const roll = Math.random();
      const stock = roll < 0.08 ? 0 : roll < 0.20 ? rand(1, 3) : rand(5, 40);

      await Variant.create({
        style: style._id,
        size,
        color,
        sku: `${style.styleCode}-${size}-${color.slice(0, 3).toUpperCase()}-${skuCounter}`,
        barcode: Math.random() < 0.6 ? `BC${1000000 + skuCounter}` : undefined,
        stock,
        priceOverride: Math.random() < 0.1 ? roundTo50(basePrice * 1.15) : null,
        reorderThreshold: rand(2, 5),
        active: true,
      });
      variantsCreated++;
    }

    if (stylesCreated % 20 === 0) console.log(`  ${stylesCreated}/${targetCount} styles...`);
  }

  console.log(`Done: ${stylesCreated} styles, ${variantsCreated} variants created.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
