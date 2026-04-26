export interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  image: string;
  description: string;
  stock: number;
  rating: number;
}

const IMAGES_BASE = 'https://nornecraft.com/products';

export const products: Product[] = [
  {
    id: 1,
    name: 'Viking Drinking Horn',
    price: 49.99,
    category: 'Drinking Horns',
    image: `${IMAGES_BASE}/horn_mug.jpeg`,
    description: 'Authentic hand-polished drinking horn with brass rim.',
    stock: 25,
    rating: 4.8,
  },
  {
    id: 2,
    name: "Odin's Horn Mug Set",
    price: 89.99,
    category: 'Drinking Horns',
    image: `${IMAGES_BASE}/horn_mug2.jpeg`,
    description: 'Set of two matching horn mugs with wooden stands.',
    stock: 10,
    rating: 4.9,
  },
  {
    id: 3,
    name: 'Wooden Mead Cup',
    price: 34.99,
    category: 'Drinking Horns',
    image: `${IMAGES_BASE}/wood_cup.jpeg`,
    description: 'Hand-turned oak mead cup, finished with food-safe beeswax.',
    stock: 30,
    rating: 4.7,
  },
  {
    id: 4,
    name: 'Horn Shot Glass Set',
    price: 44.99,
    category: 'Drinking Horns',
    image: `${IMAGES_BASE}/wood_glass.jpeg`,
    description: 'Set of four miniature horn shot glasses with iron stand.',
    stock: 35,
    rating: 4.6,
  },
  {
    id: 5,
    name: 'Hand-turned Wood Tumbler',
    price: 29.99,
    category: 'Drinking Horns',
    image: `${IMAGES_BASE}/wood_glass2.jpeg`,
    description: 'Sturdy hand-turned wood tumbler with natural grain finishhhhhhhhhhhh.',
    stock: 22,
    rating: 4.5,
  },
];
