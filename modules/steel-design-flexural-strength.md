**Here’s a complete lesson on steel beam flexural strength in Markdown format, combining your uploaded file with authoritative online resources. It explains compactness checks, case determination, and flexural stress formulas with MathJax rendering for clarity.**

---

# Steel Design: Flexural Strength of Beams

## 1. Introduction
Flexural strength in steel design refers to the ability of a beam to resist bending without failure. Beams are subjected to **transverse loads**, which generate **shear forces** and **bending moments**. The design ensures that stresses remain within allowable limits and that lateral-torsional buckling is prevented.

---

## 2. Step 1: Check Section Compactness
Before determining flexural strength, classify the section as **compact**, **non-compact**, or **slender**.

- **Flange compactness**:  
  $$ \frac{b_f}{2t_f} \leq \frac{170}{\sqrt{F_y}} \Rightarrow \text{Compact}$$

- **Web compactness**:  
  $$ \frac{d}{t_w} \leq \frac{1680}{\sqrt{F_y}}  \Rightarrow \text{Compact}$$

Where:  
- $ b_f $ = flange width  
- $ t_f $ = flange thickness  
- $ d $ = depth of section  
- $ t_w $ = web thickness  
- $ F_y $ = yield strength of steel

---

## 3. Step 2: Determine the Case (Compact Section)

**limiting lengths for buckling, $L_c$**
$$ L_c = \frac{200 \cdot b_f}{\sqrt{F_y}} $$

**limiting lengths for buckling, $L_u$**
$$ L_u = \frac{137900 \cdot A_f}{F_y \cdot d} $$

$$ A_f = b_f \cdot t_f $$



### Case 1: Short unbraced length ($ L_b \leq L_c $)  
$$ F_b = 0.66 F_y $$

### Case 2: Intermediate unbraced length ($ L_c < L_b < L_u $)
$$ F_b = 0.6 \cdot F_y $$

### Case 3: Long unbraced length ($ L_b \geq L_r $)  

**Sub Formulas**

- $C_b = 1.75 + 1.05(\frac{m_1}{m_2}) + 0.3(\frac{m_1}{m_2})^2 \leq 2.3$

- C_b = 1.0 (simply supported / cantilever)

- $ r_t = \sqrt{\frac{I_{1/3}}{A}} $

- **Case 3.a.**
$$ \frac{703270 C_b}{F_y} < (\frac{L_b}{r_t})^2 < \frac{3516330 C_b}{F_y} $$

**Linear Interpolation (Mode 3 -> 2) [Canon F-789SGA]**
| x | y |
| :---: | :---: |
| $$ \frac{703270 C_b}{F_y} $$ | $$0.6 F_y$$ |
| $$ \frac{3516330 C_b}{F_y} $$ | $$0.33 F_y$$ |

$$ F_b = (\frac{L_b}{r_t})^2 \cdot \bar{y} \geq \frac{82740 C_b A_f}{L_b \cdot d} $$
$$ F_b \leq 0.6 F_y $$ 


Where:  
- $ L_b $ = unbraced length of compression flange  
- $ L_c , L_u $ = limiting lengths for buckling  
- $ C_b $ = lateral-torsional buckling modification factor  
- $ r_t $ = radius of gyration about weak axis

---

## 4. Step 2: Non-Compact Section
For non-compact sections, the allowable stress is reduced:  
$$ F_b = 0.6 F_y $$

---

## 5. Flexural Strength (Moment Capacity)
The nominal flexural strength is:  
$$ M_n = F_b \cdot S_x $$

Design strength (factored):  
$$ M_u = \phi_b M_n $$

Where:  
- $ S_x $ = section modulus  
- $ \phi_b $ = resistance factor (typically 0.9 in LRFD)

---

## 6. Example Problem
Given:  
- $ F_y = 248 \, \text{MPa} $  
- $ b_f = 324.5 \, \text{mm}, \, t_f = 27.9 \, \text{mm} $  
- $ d = 603 \, \text{mm}, \, t_w = 27.9 \, \text{mm} $  
- $ L_b = 9 \, \text{m} $

1. Check compactness:  
   $$ \frac{b_f}{2t_f} = \frac{324.5}{2 \cdot 27.9} = 5.82 \leq \frac{170}{\sqrt{248}} = 10.8 \quad \Rightarrow \text{Compact flange}$$

   $$ \frac{d}{t_w} = \frac{603}{27.9} = 21.6 \leq \frac{1680}{\sqrt{248}} = 106.6 \quad \Rightarrow \text{Compact web}$$

   → Section is **compact**.

2. Determine case: Since \( L_b \) is moderate, use **Case 2 interpolation**.

3. Compute \( F_b \) and \( M_n \) accordingly.

---

## 7. Key Takeaways
- **Compact sections** can reach higher flexural strength.  
- **Non-compact sections** are limited to \( 0.6F_y \).  
- **Slender sections** require special buckling checks.  
- Always check **unbraced length** and apply **lateral-torsional buckling factors**.

---
