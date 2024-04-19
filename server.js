require('dotenv').config();
const AWS = require('aws-sdk');
const { Template, WalletPass } = require('@walletpass/pass-js');
const fs = require('fs');
const express = require('express');
const app = express();

app.use(express.json());

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

const getTemplate = async () => {
  const params = { Bucket: "your-s3-bucket-name", Key: "path/to/your/template.zip" };
  const data = await s3.getObject(params).promise();
  return Template.fromBuffer(data.Body);
};

app.post('/generate-pass', async (req, res) => {
  try {
    const template = await getTemplate();
    const pass = template.createPass({
      serialNumber: "123456789",
      organizationName: "Example Corp",
      description: "20% off on your next purchase!",
      logoText: req.body.logoText || "Example Corp"
    });

    pass.primaryFields.add({ key: "offer", label: "Offer", value: "20% Off" });

    const passBuffer = await pass.generate();
    const passFilePath = "/path/to/save/pass.pkpass";

    fs.writeFileSync(passFilePath, passBuffer);

    const uploadParams = {
      Bucket: "your-s3-bucket-name",
      Key: "path/to/save/pass.pkpass",
      Body: passBuffer
    };
    await s3.upload(uploadParams).promise();

    res.status(200).send({ message: "Pass generated successfully", url: passFilePath });
  } catch (error) {
    console.error("Error generating pass: ", error, process.env.AWS_REGION);
    res.status(500).send({ error: "Error generating pass" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
