// Central place for branding/business identity so cloning this POS for a new
// business (as we just did from the mini-mart version) is a one-file edit
// instead of hunting through JSX for hardcoded strings.
const businessSettings = {
  name: 'Wanguvibe',
  tagline: 'Point of Sale',
  logoPath: '/Login/logo.webp', // replace with your own logo at this path, or update the path
  address: 'Nairobi, Kenya',
  currency: 'KES',
  receiptFooter: 'Thank you for shopping with us!',
};

export default businessSettings;
