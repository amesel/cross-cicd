export const config = {
  account: '222222222222',
  region: 'ap-northeast-1',
  repositoryArn: 'arn:aws:codecommit:ap-northeast-1:111111111111:test-cross-pipeline',
  branch: 'main',
  crossAccessRoleArn: 'arn:aws:iam::111111111111:role/cross-cicd-role',
  deployBucketName: 'cross-cicd-222222222222'
};
