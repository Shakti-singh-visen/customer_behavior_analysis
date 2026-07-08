import csv
import json
import os
import math

source_csv = r"C:\Users\ASUS\Downloads\customer_behavior_analysis-main\customer_behavior_analysis-main\customer_shopping_behavior.csv"
target_dir = r"C:\Users\ASUS\.gemini\antigravity\scratch\customer_behavior_webform\js"
target_js = os.path.join(target_dir, "dataset.js")

# Ensure target directory exists
os.makedirs(target_dir, exist_ok=True)

# Frequency mapping
frequency_mapping = {
    'Fortnightly': 14,
    'Weekly': 7,
    'Monthly': 30,
    'Quarterly': 90,
    'Bi-Weekly': 14,
    'Annually': 365,
    'Every 3 Months': 90
}

# Read rows with utf-8-sig to handle BOM
rows = []
with open(source_csv, mode='r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

# Clean fields and track review ratings for median calculation
ratings_by_category = {}
for row in rows:
    category = row['Category']
    rating_str = row['Review Rating']
    if rating_str and rating_str.strip():
        try:
            rating = float(rating_str)
            ratings_by_category.setdefault(category, []).append(rating)
        except ValueError:
            pass

# Compute median rating per category
medians_by_category = {}
for cat, ratings in ratings_by_category.items():
    sorted_ratings = sorted(ratings)
    n = len(sorted_ratings)
    if n > 0:
        if n % 2 == 1:
            median = sorted_ratings[n // 2]
        else:
            median = (sorted_ratings[(n // 2) - 1] + sorted_ratings[n // 2]) / 2.0
        medians_by_category[cat] = round(median, 2)
    else:
        medians_by_category[cat] = 3.5  # default fallback

# Pre-calculate age quartiles
ages = []
for row in rows:
    try:
        ages.append(int(row['Age']))
    except ValueError:
        pass

ages_sorted = sorted(ages)
n_ages = len(ages_sorted)
q25 = ages_sorted[int(n_ages * 0.25)] if n_ages > 0 else 31
q50 = ages_sorted[int(n_ages * 0.50)] if n_ages > 0 else 44
q75 = ages_sorted[int(n_ages * 0.75)] if n_ages > 0 else 57

def get_age_group(age):
    if age <= q25:
        return 'Young Adult'
    elif age <= q50:
        return 'Adult'
    elif age <= q75:
        return 'Middle-aged'
    else:
        return 'Senior'

# Transform dataset
clean_data = []
for row in rows:
    try:
        customer_id = int(row['Customer ID'])
        age = int(row['Age'])
        purchase_amount = float(row['Purchase Amount (USD)'])
        previous_purchases = int(row['Previous Purchases'])
    except (ValueError, KeyError) as e:
        continue

    category = row['Category']
    rating_str = row['Review Rating']
    if not rating_str or not rating_str.strip():
        rating = medians_by_category.get(category, 3.5)
    else:
        try:
            rating = float(rating_str)
        except ValueError:
            rating = medians_by_category.get(category, 3.5)

    freq = row['Frequency of Purchases']
    freq_days = frequency_mapping.get(freq, 30)  # Default fallback to Monthly (30 days)

    clean_item = {
        'customer_id': customer_id,
        'age': age,
        'gender': row['Gender'],
        'item_purchased': row['Item Purchased'],
        'category': category,
        'purchase_amount': purchase_amount,
        'location': row['Location'],
        'size': row['Size'],
        'color': row['Color'],
        'season': row['Season'],
        'review_rating': round(rating, 2),
        'subscription_status': row['Subscription Status'],
        'shipping_type': row['Shipping Type'],
        'discount_applied': row['Discount Applied'],
        'previous_purchases': previous_purchases,
        'payment_method': row['Payment Method'],
        'frequency_of_purchases': freq,
        'age_group': get_age_group(age),
        'purchase_frequency_days': freq_days
    }
    clean_data.append(clean_item)

# Write to js/dataset.js
with open(target_js, mode='w', encoding='utf-8') as f:
    f.write("/**\n * Customer Shopping Behavior Dataset\n * Preprocessed and cleaned from CSV\n */\n")
    f.write("const initialCustomerData = ")
    json.dump(clean_data, f, indent=2)
    f.write(";\n")

print(f"Successfully converted {len(clean_data)} rows and wrote to {target_js}")
print(f"Age group thresholds: Q25={q25}, Q50={q50}, Q75={q75}")
print(f"Medians by category: {medians_by_category}")
