/** Small offline gazetteer used for best-effort city/state/country detection on address lines.
 *  Deliberately scoped to the Indian industrial-expo context this app targets; extend as needed. */

export const INDIAN_STATES: string[] = [
  'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat',
  'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh',
  'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha', 'punjab', 'rajasthan',
  'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh', 'uttarakhand', 'west bengal',
  'delhi', 'ncr', 'chandigarh', 'puducherry', 'jammu and kashmir',
];

export const MAJOR_CITIES: string[] = [
  'ahmedabad', 'mumbai', 'pune', 'surat', 'rajkot', 'vadodara', 'baroda', 'delhi', 'new delhi',
  'gurgaon', 'gurugram', 'noida', 'bangalore', 'bengaluru', 'chennai', 'coimbatore', 'hyderabad',
  'kolkata', 'jaipur', 'indore', 'nagpur', 'ludhiana', 'faridabad', 'ghaziabad', 'kanpur',
  'lucknow', 'nashik', 'aurangabad', 'bhopal', 'visakhapatnam', 'vijayawada', 'jamnagar',
  'bhavnagar', 'gandhinagar', 'anand', 'valsad', 'vapi',
];

export const ADDRESS_KEYWORDS: string[] = [
  'road', 'street', 'st.', 'nagar', 'marg', 'estate', 'industrial area', 'sector', 'floor',
  'building', 'chowk', 'cross', 'lane', 'colony', 'gidc', 'phase', 'plot', 'compound', 'circle',
  'highway', 'near', 'opp', 'opposite',
];

export const PIN_CODE_REGEX = /\b(\d{6})\b/;
