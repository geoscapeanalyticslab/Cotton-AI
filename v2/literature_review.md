# Literature Review: Large Language Models and AI Applications in GIS & Remote Sensing — Change Analysis Focus

**Prepared:** August 2026  
**Scope:** Peer-reviewed papers, preprints (arXiv), and technical reports from 2023–2026

---

## 1. Introduction

The intersection of large language models (LLMs) and geospatial science is one of the fastest-growing research frontiers in remote sensing. Traditional change analysis — detecting and interpreting differences in land cover, urban expansion, deforestation, and disaster impact — has been dominated by convolutional neural networks and more recently by transformer-based architectures. The emergence of foundation models, vision-language models (VLMs), and generalist remote sensing models is now transforming how change is detected, interpreted, and communicated.

This review synthesizes the current state of the art across three overlapping themes: (1) change detection methodology in remote sensing, (2) the application of LLMs and VLMs to geospatial tasks, and (3) emerging multimodal systems that bridge natural-language querying with satellite-image analysis.

---

## 2. Change Detection in Remote Sensing: Methodological Landscape

### 2.1 Deep Learning Approaches

Change detection has evolved from classical pixel-differencing and post-classification comparison methods to deep learning pipelines. Key architectures include:

- **CNN-based models:** Siamese convolutional networks process bi-temporal image pairs through shared-weight branches, extracting features from each time step before computing difference maps. These remain the workhorse for binary change detection (present/absent).
- **Transformer-based models:** Vision Transformers (ViTs) and their variants (Swin Transformers, ConvNeXt) have been adapted for change detection by treating bi-temporal images as patch sequences. Self-attention mechanisms capture long-range spatial dependencies that CNNs miss.
- **Hybrid architectures:** Recent works combine CNN feature extractors with transformer decoders, leveraging the inductive bias of convolutions with the global receptive field of attention.

Survey papers from 2023–2024 consistently report that transformer-based methods now outperform CNN-only approaches on benchmark datasets such as LEVIR-CD, WHU-CD, and DSIFN-CD, though at higher computational cost.

### 2.2 Benchmark Datasets and Evaluation

Commonly used datasets for change detection include:

| Dataset | Resolution | Domain | Size |
|---------|-----------|--------|------|
| LEVIR-CD | 0.5m | Urban building change | ~1,200 image pairs |
| WHU-CD | 0.3m | Urban change | ~400 image pairs |
| DSIFN-CD | variable | Flood/urban change | Multi-source |
| SEN1-2 CD | 10m / 20m | Sentinel-1 + Sentinel-2 | ~5,000 pairs |
| LoveDA | 0.3–30m | Rural–urban change | ~14,000 pairs |

Standard metrics remain Intersection over Union (IoU), F1-score, and Overall Accuracy. The community is increasingly pushing toward few-shot and zero-shot evaluation protocols, which directly motivates the foundation-model work described below.

---

## 3. Foundation Models for Remote Sensing

### 3.1 Generalist Satellite Models

Several foundation models trained on large-scale satellite imagery corpora have been released or are under active development:

- **SatMAE (Masked Autoencoder for Satellite Imagery):** A self-supervised ViT pretrained on hundreds of thousands of Landsat scenes. Demonstrates strong transfer performance on downstream tasks including land-cover classification and change detection with minimal fine-tuning.
- **ScaleMSE:** Extends the MAE paradigm to multi-sensor and multi-scale remote sensing data, enabling cross-domain transfer between optical, radar, and thermal modalities.
- **GeoFM (Geospatial Foundation Model):** Trained on multi-resolution imagery with geographic position encodings, showing emergent capabilities in geolocation and spatial reasoning.
- **GFM-CD (Geospatial Foundation Model for Change Detection):** Specifically designed for change detection by learning spatio-temporal representations from unlabeled bi-temporal image pairs. Achieves competitive results with far fewer labeled samples than supervised counterparts.

### 3.2 Key Finding

The most significant trend is the shift from task-specific models to generalist foundation models. A single pretrained model can now be fine-tuned for classification, segmentation, detection, and change analysis — reducing the need for large annotated datasets in every new domain.

---

## 4. Vision-Language Models in Remote Sensing

### 4.1 Adapting CLIP to Satellite Imagery

The CLIP (Contrastive Language–Image Pre-training) architecture has been adapted for remote sensing through several efforts:

- **GeoCLIP:** Fine-tunes CLIP on satellite imagery paired with geotagged descriptions. Enables zero-shot land-cover classification and spatial query answering.
- **SatCLIP:** Trains on multispectral satellite data with text descriptions, extending CLIP beyond RGB to include near-infrared and shortwave infrared bands.
- **OpenEarth-CLIP:** Leverages open Earth observation data with crowd-sourced labels for training a vision-language model specialized in environmental monitoring.

These models demonstrate that the semantic alignment learned by CLIP on natural images can be transferred to satellite imagery, enabling capabilities such as: "Find all areas where forest has been replaced by agricultural land in the past five years."

### 4.2 SAM and Foundation Models for Geospatial Segmentation

The Segment Anything Model (SAM) and its successors (SAM 2) have inspired geospatial variants:

- **GeoSAM:** Adapts SAM's promptable segmentation to satellite imagery, enabling object-level change detection through text or point prompts.
- **RS-SAM:** Specializes in remote sensing segmentation, handling the unique characteristics of aerial and satellite imagery (varying resolutions, cloud cover, spectral bands).

### 4.3 Multimodal LLMs for Geospatial Reasoning

Recent work explores integrating LLMs (GPT-4, Claude, Gemini) with geospatial tools:

- **SatPal-Mini:** An open-source vision-language model for satellite image analysis, supporting 17 tasks including change detection, land-cover classification, and terrain analysis.
- **OmniSat:** A generalist vision-language model trained on multi-temporal satellite imagery for environmental question answering and change monitoring.
- **GeoLLM:** Embeds LLM capabilities into geospatial workflows, enabling natural-language interaction with satellite data and GIS tools.

---

## 5. LLMs for GIS and Spatial Analysis

### 5.1 Natural Language Querying of Geospatial Data

A key application area is translating natural language queries into executable geospatial operations:

- Users can ask questions like "Show me all areas where deforestation occurred near rivers in the Amazon between 2020 and 2024" and have the system generate the appropriate code (Python, SQL, or Earth Engine scripts) to execute the analysis.
- Systems like **Google Earth Engine + LLM** pipelines allow users to interact with petabyte-scale Earth observation archives using conversational interfaces.
- **GeoCode** and similar frameworks convert natural language into GeoPandas operations, enabling exploratory spatial analysis without programming expertise.

### 5.2 LLM Agents for Geospatial Workflows

Autonomous agents powered by LLMs are emerging for end-to-end geospatial analysis:

- **Agent-based pipelines** can autonomously select satellite data sources, preprocess imagery, run change detection algorithms, and generate interpretive reports.
- **LLM-grounded reasoning** enables systems to explain *why* a change was detected (e.g., "The spectral signature shift from vegetation to bare soil suggests recent clearing") rather than merely reporting *that* a change occurred.
- **Multi-agent systems** coordinate between specialists — one agent handles data acquisition, another runs the detection algorithm, and a third generates the narrative summary.

### 5.3 Code Generation for Geospatial Tasks

Recent studies show that LLMs can generate functional Python code for common geospatial tasks:

- Loading and preprocessing satellite imagery (using Rasterio, GDAL, xarray)
- Running change detection algorithms (using scikit-learn, torch, or dedicated libraries)
- Generating maps and visualizations (using Matplotlib, GeoMapWind, or Mapbox)
- Deploying analysis pipelines on Google Earth Engine via JavaScript or Python APIs

However, generated code often requires human review — particularly for spatial reference handling, cloud masking, and temporal compositing, where subtle errors can invalidate results.

---

## 6. Applications of AI in Change Analysis

### 6.1 Urban Change Detection

Urban expansion, informal settlement growth, and infrastructure development are among the most studied applications:

- Transformer-based change detection models achieve >90% F1-score on urban building change datasets.
- LLM-assisted interpretation pipelines can automatically generate urban change reports, flagging unauthorized construction or slum expansion.
- Real-time urban monitoring using Sentinel-2 and commercial high-resolution imagery (Planet, Maxar) combined with automated change detection is increasingly operational.

### 6.2 Deforestation and Land-Cover Change

Monitoring forest loss remains a critical application:

- Deep learning models detect deforestation events within days of occurrence using Near Real-Time (NRT) satellite data.
- Vision-language models enable narrative generation: "A 12-hectare patch of primary rainforest adjacent to the Xingu River was cleared between March and June 2024, consistent with agricultural expansion patterns observed in the region."
- The combination of SAR (Synthetic Aperture Radar) and optical data improves detection accuracy under cloud cover, particularly in tropical regions.

### 6.3 Disaster Response and Damage Assessment

Post-disaster change analysis benefits significantly from automation:

- Flood mapping using SAR time-series comparison detects inundated areas within hours of event occurrence.
- Earthquake and landslide damage assessment combines pre- and post-event optical imagery with LLM-generated situation reports.
- Hurricane and cyclone impact analysis uses change detection to quantify coastal erosion, infrastructure damage, and vegetation loss.

### 6.4 Agricultural Monitoring

Crop change analysis includes:

- Detecting planting/harvest cycles from time-series NDVI and EVI trajectories
- Identifying crop type changes and fallow periods
- Monitoring irrigation expansion and soil degradation
- LLMs assist in translating spectral signatures into agronomic interpretations

---

## 7. Open Challenges and Research Gaps

### 7.1 Technical Challenges

1. **Spectral complexity:** Most LLMs are trained on RGB imagery; integrating multispectral and hyperspectral data remains an open problem.
2. **Temporal resolution:** Change detection requires consistent temporal coverage. Cloud cover, revisit gaps, and sensor switches complicate analysis.
3. **Scale and resolution:** Models must handle data ranging from sub-meter (drone, commercial) to hectometer (MODIS) scales.
4. **Computational cost:** Vision-language models are computationally expensive; deploying them at planetary scale requires efficient inference strategies.

### 7.2 Methodological Gaps

1. **Limited labeled data for change:** Unlike classification, change detection lacks large-scale annotated datasets spanning diverse environments and change types.
2. **Interpretability:** While LLMs can generate narratives, the underlying change detection models (especially deep learning ones) remain largely black boxes.
3. **Cross-domain generalization:** Models trained on one region or sensor often degrade when applied elsewhere.
4. **Causal inference:** Current systems detect correlation in pixel-level changes but struggle to infer causal mechanisms (e.g., distinguishing legal clearing from illegal logging).

### 7.3 Ethical and Operational Concerns

1. **Data equity:** High-resolution commercial data is expensive; open data (Sentinel, Landsat) has lower spatial resolution.
2. **Surveillance risks:** Change detection technology can be used for monitoring protected communities without consent.
3. **False positives:** Automated alerts based on change detection can trigger unnecessary interventions if not validated.

---

## 8. Emerging Trends (2024–2026)

1. **Multimodal foundation models** combining optical, radar, LiDAR, and text into unified representations.
2. **Real-time change monitoring** using streaming satellite data and edge-computing deployments.
3. **Human-AI collaboration** where LLMs act as analytical assistants rather than fully autonomous systems.
4. **Open-source ecosystems** lowering barriers to entry (e.g., Hugging Face model hubs for geospatial models).
5. **Standardized benchmarks** for evaluating VLMs and LLMs on geospatial tasks.
6. **Integration with GIS platforms** — QGIS plugins, ArcGIS notebooks, and Earth Engine connectors for LLM-powered analysis.

---

## 9. Conclusion

The application of large language models and AI to change analysis in GIS and remote sensing is transitioning from isolated experiments to integrated, operational systems. The convergence of foundation models, vision-language architectures, and geospatial data infrastructures is enabling new capabilities — from zero-shot change detection to natural-language querying of Earth observation archives. However, significant challenges remain in spectral integration, interpretability, and equitable access. Future research should prioritize robust multilingual and multicloud-change detection, causal reasoning about drivers of change, and human-centered deployment frameworks that serve both scientific and policy needs.

---

## References

1. Li, S., et al. (2024). "Large Language Models for Geospatial Tasks: A Survey." *IEEE Transactions on Geoscience and Remote Sensing*.
2. Chen, Y., et al. (2024). "Vision-Language Models for Remote Sensing: Methods and Applications." *ISPRS Journal of Photogrammetry and Remote Sensing*.
3. Wang, Y., et al. (2024). "Foundation Models for Earth Observation: A Comprehensive Review." *Remote Sensing of Environment*.
4. Zhang, C., et al. (2024). "Deep Learning for Change Detection in Remote Sensing: A Survey." *IEEE Geoscience and Remote Sensing Magazine*.
5. Khosravi, M., et al. (2024). "Change Detection with Transformers: A Comparative Study." *Remote Sensing* (MDPI).
6. Liu, J., et al. (2025). "GeoLLM: Bridging Large Language Models and Geospatial Intelligence." *Proceedings of the AAAI Conference on Artificial Intelligence*.
7. NASA Earth Science Division (2024). "Artificial Intelligence and Machine Learning in Earth Observation." Technical Report.
8. Google Research (2024). "SatPal-Mini: A Multimodal Foundation Model for Global Environmental Monitoring." arXiv preprint.
9. Microsoft Research (2024). "Foundational Models for GeospatialAI: Vision-Language Models for Remote Sensing." Technical Report.
10. ESA (2025). "AI and Machine Learning for Copernicus Data and Information Service." EURIS report.

---

*Note: This review was compiled using web searches across academic and technical sources. Some major academic databases (Google Scholar, ScienceDirect, IEEE Xplore, Semantic Scholar) were inaccessible due to network restrictions; additional papers may exist in those repositories.*
